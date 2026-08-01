import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashAdminPw, isOwnerInviteCode, signSession, sessionCookieHeader } from "@/lib/adminAuth";
import { sendEmail, verifyEmailContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const inviteCode = String(body.inviteCode || "").trim();

  if (!inviteCode) return NextResponse.json({ error: "請輸入邀請碼" }, { status: 400 });
  if (username.length < 1) return NextResponse.json({ error: "請輸入帳號" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "密碼至少要 8 個字" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  let role: "owner" | "staff";
  let inviteCodeRowId: string | null = null;

  if (isOwnerInviteCode(inviteCode)) {
    role = "owner";
  } else {
    // staff 用的是一次性邀請碼，存在資料庫裡，要沒被用過才算數
    const { data: codeRow } = await supabase
      .from("admin_invite_codes")
      .select("*")
      .eq("code", inviteCode)
      .eq("used", false)
      .maybeSingle();
    if (!codeRow) return NextResponse.json({ error: "邀請碼錯誤，或這組邀請碼已經被使用過了" }, { status: 401 });
    role = "staff";
    inviteCodeRowId = codeRow.id;
  }

  const { data: existingUsername } = await supabase.from("admins").select("id").ilike("username", username).maybeSingle();
  if (existingUsername) return NextResponse.json({ error: "這個帳號已經被註冊了" }, { status: 409 });
  const { data: existingEmail } = await supabase.from("admins").select("id").ilike("email", email).maybeSingle();
  if (existingEmail) return NextResponse.json({ error: "這個 Email 已經被註冊過了" }, { status: 409 });

  const passwordHash = await hashAdminPw(password);
  const verifyToken = genToken();
  const { data: created, error } = await supabase
    .from("admins")
    .insert({
      username,
      email,
      password_hash: passwordHash,
      role,
      verify_token: verifyToken,
      verify_token_expires: hoursFromNow(24),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 帳號真的建立成功後，才把這組一次性邀請碼標記為已使用（避免中途失敗白白燒掉一組邀請碼）
  if (inviteCodeRowId) {
    await supabase
      .from("admin_invite_codes")
      .update({ used: true, used_by: username, used_at: new Date().toISOString() })
      .eq("id", inviteCodeRowId);
  }

  // 寄驗證信（就算寄信失敗也不擋註冊流程，只是要讓前端知道信有沒有真的寄出去）
  let verifyEmailSent = true;
  try {
    const link = `${getSiteUrl()}/api/admin/auth/verify-email?token=${verifyToken}`;
    const { html, text } = verifyEmailContent(username, link);
    await sendEmail(email, "請驗證你的米舖後台帳號信箱", html, text);
  } catch (e) {
    console.error("驗證信寄送失敗：", e);
    verifyEmailSent = false;
  }

  const token = signSession(created.id, created.username, created.role);
  const res = NextResponse.json({ ok: true, username: created.username, role: created.role, verifyEmailSent });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
