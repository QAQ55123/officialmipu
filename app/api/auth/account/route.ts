import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyMemberPw, normFb } from "@/lib/util";
import { sendEmail, verifyEmailContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";
import { syncMembersSheet } from "@/lib/sheetsSync";

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const newEmail = body.newEmail ? String(body.newEmail).trim().toLowerCase() : null;
  const newProfileUrlRaw = body.newProfileUrl ? String(body.newProfileUrl).trim() : null;

  if (!username || !password) return NextResponse.json({ error: "請輸入帳號密碼" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  const ok = await verifyMemberPw(password, member.password_hash);
  if (!ok) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  const updates: Record<string, any> = {};
  let sentVerifyEmail = false;

  if (newEmail && newEmail !== member.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: "Email 格式不正確" }, { status: 400 });
    }
    const { data: existing } = await supabase.from("members").select("id").ilike("email", newEmail).neq("id", member.id).maybeSingle();
    if (existing) return NextResponse.json({ error: "這個 Email 已經被其他帳號使用" }, { status: 409 });

    const verifyToken = genToken();
    updates.email = newEmail;
    updates.email_verified = false;
    updates.verify_token = verifyToken;
    updates.verify_token_expires = hoursFromNow(24);
    sentVerifyEmail = true;
  } else if (newEmail && newEmail === member.email && !member.email_verified) {
    // 信箱沒變，但還沒驗證過：重新寄一次驗證信
    const verifyToken = genToken();
    updates.verify_token = verifyToken;
    updates.verify_token_expires = hoursFromNow(24);
    sentVerifyEmail = true;
  }

  let profileUrlSubmittedForReview = false;
  let profileUrlCosmeticUpdate = false;
  if (newProfileUrlRaw) {
    const newProfileUrl = /^https?:\/\//i.test(newProfileUrlRaw) ? newProfileUrlRaw : "https://" + newProfileUrlRaw;
    const newProfileUrlNorm = normFb(newProfileUrl);
    if (newProfileUrlNorm !== member.profile_url_norm) {
      const { data: existing } = await supabase.from("members").select("id").eq("profile_url_norm", newProfileUrlNorm).neq("id", member.id).maybeSingle();
      if (existing) return NextResponse.json({ error: "這個個人頁網址已經被其他帳號使用" }, { status: 409 });
      const { data: existingPending } = await supabase.from("members").select("id").eq("pending_profile_url_norm", newProfileUrlNorm).neq("id", member.id).maybeSingle();
      if (existingPending) return NextResponse.json({ error: "這個個人頁網址已經有其他人送出審核中" }, { status: 409 });
      // 個人頁網址修改需要最高管理者審核，先存到待審核欄位，不會直接生效
      updates.pending_profile_url = newProfileUrl;
      updates.pending_profile_url_norm = newProfileUrlNorm;
      profileUrlSubmittedForReview = true;
    } else if (newProfileUrl !== member.profile_url) {
      // 正規化後其實是同一個網址（例如只是少了 ?locale= 這種查詢參數），
      // 代表核心網址沒有變，不需要審核，直接更新顯示用的網址就好
      updates.profile_url = newProfileUrl;
      profileUrlCosmeticUpdate = true;
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("members").update(updates).eq("id", member.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    syncMembersSheet().catch(() => {});
  }

  if (sentVerifyEmail) {
    const targetEmail = updates.email || member.email;
    try {
      const link = `${getSiteUrl()}/api/auth/verify-email?token=${updates.verify_token}`;
      const { html, text } = verifyEmailContent(member.username, link);
      await sendEmail(targetEmail, "請驗證你的信箱", html, text);
    } catch (e) {
      console.error("驗證信寄送失敗：", e);
      return NextResponse.json({ error: "驗證信寄送失敗，請稍後再試" }, { status: 500 });
    }
  }

  const { data: updated } = await supabase.from("members").select("*").eq("id", member.id).single();
  return NextResponse.json({
    ok: true,
    username: updated.username,
    profileUrl: updated.profile_url,
    pendingProfileUrl: updated.pending_profile_url,
    email: updated.email,
    emailVerified: updated.email_verified,
    verifyEmailSent: sentVerifyEmail,
    profileUrlSubmittedForReview,
    profileUrlCosmeticUpdate,
  });
}
