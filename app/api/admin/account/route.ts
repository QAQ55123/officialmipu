import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, verifyAdminPw } from "@/lib/adminAuth";
import { sendEmail, verifyEmailContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";

export async function POST(req: Request) {
  let session;
  try {
    session = requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const password = String(body.password || "");
  const newEmail = String(body.newEmail || "").trim().toLowerCase();
  if (!password) return NextResponse.json({ error: "請輸入目前的密碼" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ error: "請輸入有效的 Email" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: admin } = await supabase.from("admins").select("*").eq("id", session.adminId).single();
  if (!admin) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  const ok = await verifyAdminPw(password, admin.password_hash);
  if (!ok) return NextResponse.json({ error: "密碼錯誤" }, { status: 403 });

  if (newEmail === admin.email) {
    if (admin.email_verified) {
      return NextResponse.json({ ok: true, email: admin.email, emailVerified: true, verifyEmailSent: false });
    }
    // 信箱沒變，但還沒驗證過：重新寄一次驗證信
    const verifyToken = genToken();
    await supabase
      .from("admins")
      .update({ verify_token: verifyToken, verify_token_expires: hoursFromNow(24) })
      .eq("id", admin.id);
    try {
      const link = `${getSiteUrl()}/api/admin/auth/verify-email?token=${verifyToken}`;
      const { html, text } = verifyEmailContent(admin.username, link);
      await sendEmail(admin.email, "請驗證你的米舖後台帳號信箱", html, text);
    } catch (e) {
      console.error("驗證信寄送失敗：", e);
      return NextResponse.json({ error: "驗證信寄送失敗，請確認寄信服務設定是否正確" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, email: admin.email, emailVerified: false, verifyEmailSent: true });
  }

  const { data: existing } = await supabase.from("admins").select("id").ilike("email", newEmail).neq("id", admin.id).maybeSingle();
  if (existing) return NextResponse.json({ error: "這個 Email 已經被其他管理者使用" }, { status: 409 });

  const verifyToken = genToken();
  await supabase
    .from("admins")
    .update({ email: newEmail, email_verified: false, verify_token: verifyToken, verify_token_expires: hoursFromNow(24) })
    .eq("id", admin.id);

  try {
    const link = `${getSiteUrl()}/api/admin/auth/verify-email?token=${verifyToken}`;
    const { html, text } = verifyEmailContent(admin.username, link);
    await sendEmail(newEmail, "請驗證你的米舖後台帳號信箱", html, text);
  } catch (e) {
    console.error("驗證信寄送失敗：", e);
  }

  return NextResponse.json({ ok: true, email: newEmail, emailVerified: false, verifyEmailSent: true });
}
