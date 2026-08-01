import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashMemberPw, normFb } from "@/lib/util";
import { sendEmail, verifyEmailContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";
import { signMemberSession, memberSessionCookieHeader } from "@/lib/memberAuth";
import { syncMembersSheet } from "@/lib/sheetsSync";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

/** 舊會員確認身份後，設定新帳密、正式建立帳號，並把該身份底下的舊訂單改指定成新帳號 */
export async function POST(req: Request) {
  const body = await req.json();
  const identityId = String(body.identityId || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const email = String(body.email || "").trim().toLowerCase();

  if (!identityId) return NextResponse.json({ error: "缺少身份資訊，請重新操作一次" }, { status: 400 });
  if (username.length < 1) return NextResponse.json({ error: "請輸入帳號" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "密碼至少要 6 個字" }, { status: 400 });
  if (password !== confirmPassword) return NextResponse.json({ error: "兩次輸入的密碼不一樣" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: identity } = await supabase.from("legacy_identities").select("*").eq("id", identityId).maybeSingle();
  if (!identity) return NextResponse.json({ error: "找不到這筆身份資料，請重新操作一次" }, { status: 404 });
  if (identity.claimed_by_member_id) {
    return NextResponse.json({ error: "這筆資料已經被認領過了，如果這是你本人的帳號，請直接登入或使用忘記密碼" }, { status: 409 });
  }

  const { data: existingUsername } = await supabase.from("members").select("id").ilike("username", username).maybeSingle();
  if (existingUsername) return NextResponse.json({ error: "這個帳號已經被註冊了，換一個試試看" }, { status: 409 });

  const { data: existingEmail } = await supabase.from("members").select("id").ilike("email", email).maybeSingle();
  if (existingEmail) return NextResponse.json({ error: "這個 Email 已經被註冊過了" }, { status: 409 });

  const profileUrl = identity.fb_profile_url;
  const profileUrlNorm = normFb(profileUrl);
  const { data: existingProfile } = await supabase.from("members").select("id").eq("profile_url_norm", profileUrlNorm).maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ error: "這個個人頁網址已經被註冊過了，如果這是你本人的帳號，請直接登入或使用忘記密碼" }, { status: 409 });
  }

  const passwordHash = await hashMemberPw(password);
  const verifyToken = genToken();

  const { data: created, error } = await supabase
    .from("members")
    .insert({
      username,
      password_hash: passwordHash,
      profile_url: profileUrl,
      profile_url_norm: profileUrlNorm,
      email,
      verify_token: verifyToken,
      verify_token_expires: hoursFromNow(24),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 標記身份已被認領
  await supabase
    .from("legacy_identities")
    .update({ claimed_by_member_id: created.id, claimed_at: new Date().toISOString() })
    .eq("id", identity.id);

  // 把這個身份底下的舊訂單都改指定成新帳號，之後查歷史訂單就找得到
  const { data: affectedOrders } = await supabase
    .from("orders")
    .update({ username, profile_url: profileUrl, legacy_unmatched: false })
    .eq("legacy_identity_id", identity.id)
    .select("id, plan_id, plans(name)");

  // 寄驗證信（失敗不擋流程）
  let verifyEmailSent = true;
  try {
    const link = `${getSiteUrl()}/api/auth/verify-email?token=${verifyToken}`;
    const { html, text } = verifyEmailContent(username, link);
    await sendEmail(email, "請驗證你的米舖帳號信箱", html, text);
  } catch (e) {
    console.error("驗證信寄送失敗：", e);
    verifyEmailSent = false;
  }

  // 同步受影響的企劃分頁到 Google Sheet（訂單擁有者改了，Sheet 上的暱稱欄也要跟著更新）
  const planMap = new Map<string, string>();
  for (const o of affectedOrders || []) {
    const planId = (o as any).plan_id;
    const planName = (o as any).plans?.name;
    if (planId && planName) planMap.set(planId, planName);
  }
  let syncWarning = "";
  for (const [planId, planName] of planMap) {
    try {
      await syncOrderRealtimeToPlanTab(planId, planName);
      await syncOnePlanCostTab(planId, planName);
    } catch (e: any) {
      syncWarning = "帳號已建立、訂單也已經轉移到你的新帳號，但同步到 Google Sheet 時發生問題：" + (e?.message || "未知錯誤");
    }
  }

  const token = signMemberSession(created.id, created.username);
  const res = NextResponse.json({
    ok: true,
    username: created.username,
    profileUrl: created.profile_url,
    email: created.email,
    emailVerified: false,
    verifyEmailSent,
    claimedOrders: (affectedOrders || []).length,
    syncWarning: syncWarning || undefined,
  });
  res.headers.set("Set-Cookie", memberSessionCookieHeader(token));
  syncMembersSheet().catch(() => {});
  return res;
}
