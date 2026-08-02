import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail, resetPasswordContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "請輸入 Email" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: admin } = await supabase.from("admins").select("*").ilike("email", email).maybeSingle();

  // 不論帳號存不存在都回傳同樣的成功訊息，避免被拿來刺探哪些 Email 有註冊過
  if (admin) {
    const token = genToken();
    await supabase.from("admins").update({ reset_token: token, reset_token_expires: hoursFromNow(1) }).eq("id", admin.id);
    try {
      const link = `${getSiteUrl()}/admin/reset-password?token=${token}`;
      const { html, text } = resetPasswordContent(admin.username, link);
      await sendEmail(email, "重設你的米舖後台密碼", html, text);
    } catch (e) {
      console.error("重設密碼信寄送失敗：", e);
    }
  }

  return NextResponse.json({ ok: true });
}
