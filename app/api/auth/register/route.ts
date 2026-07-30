import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashMemberPw, normFb } from "@/lib/util";
import { sendEmail, verifyEmailContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";
import { signMemberSession, memberSessionCookieHeader } from "@/lib/memberAuth";
// 新站不需要 Google Sheets 同步（mibu-app 原本用來備份會員清單）

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const profileUrlRaw = String(body.profileUrl || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (username.length < 1) return NextResponse.json({ error: "請輸入帳號" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "密碼至少要 6 個字" }, { status: 400 });
  if (password !== confirmPassword) return NextResponse.json({ error: "兩次輸入的密碼不一樣" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });

  // 個人頁網址是 mibu-app 特有的規則（新站規格沒有要求），這裡改成選填
  const profileUrl = profileUrlRaw
    ? /^https?:\/\//i.test(profileUrlRaw)
      ? profileUrlRaw
      : "https://" + profileUrlRaw
    : null;
  const profileUrlNorm = profileUrl ? normFb(profileUrl) : null;

  const supabase = getSupabaseAdmin();

  const { data: existingUsername } = await supabase.from("members").select("id").ilike("username", username).maybeSingle();
  if (existingUsername) return NextResponse.json({ error: "這個帳號已經被註冊了" }, { status: 409 });

  const { data: existingEmail } = await supabase.from("members").select("id").ilike("email", email).maybeSingle();
  if (existingEmail) return NextResponse.json({ error: "這個 Email 已經被註冊過了" }, { status: 409 });

  if (profileUrlNorm) {
    const { data: existingProfile } = await supabase.from("members").select("id").eq("profile_url_norm", profileUrlNorm).maybeSingle();
    if (existingProfile) return NextResponse.json({ error: "這個個人頁網址已經被註冊過了" }, { status: 409 });
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

  // 寄驗證信（就算寄信失敗也不擋註冊流程，只是要讓前端知道信有沒有真的寄出去）
  let verifyEmailSent = true;
  try {
    const link = `${getSiteUrl()}/api/auth/verify-email?token=${verifyToken}`;
    const { html, text } = verifyEmailContent(username, link);
    await sendEmail(email, "請驗證你的帳號信箱", html, text);
  } catch (e) {
    console.error("驗證信寄送失敗：", e);
    verifyEmailSent = false;
  }

  const token = signMemberSession(created.id, created.username);
  const res = NextResponse.json({
    ok: true,
    username: created.username,
    profileUrl: created.profile_url,
    email: created.email,
    emailVerified: false,
    verifyEmailSent,
  });
  res.headers.set("Set-Cookie", memberSessionCookieHeader(token));
  // 新站不做 Google Sheets 同步，這裡原本 mibu-app 是拿來備份會員清單用的
  return res;
}
