import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail, resetPasswordContent } from "@/lib/resend";
import { genToken, hoursFromNow, getSiteUrl } from "@/lib/tokens";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "請輸入 Email" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("email", email).maybeSingle();

  if (member) {
    const token = genToken();
    await supabase.from("members").update({ reset_token: token, reset_token_expires: hoursFromNow(1) }).eq("id", member.id);
    try {
      const link = `${getSiteUrl()}/reset-password?token=${token}`;
      const { html, text } = resetPasswordContent(member.username, link);
      await sendEmail(email, "重設你的米舖帳號密碼", html, text);
    } catch (e) {
      console.error("重設密碼信寄送失敗：", e);
    }
  }

  // 不論這個 Email 有沒有對應會員，都回傳同樣訊息，避免被拿來刺探會員名單
  return NextResponse.json({ ok: true });
}
