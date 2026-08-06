import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isExpired, getSiteUrl } from "@/lib/tokens";

/**
 * GET：只把 token 帶到確認頁面，不做任何驗證動作。
 * 原因：Gmail 等信箱服務會在使用者真的點下去之前，先自己去存取信件裡的每個網址做安全掃描，
 * 如果 GET 就直接執行驗證，token 會被掃描機器人用掉，使用者自己點的時候反而顯示「已過期」。
 * 改成「GET 只顯示確認頁 → 使用者按下按鈕才用 POST 真正驗證」，掃描機器人不會送出 POST，就不會誤觸發。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const site = getSiteUrl();
  if (!token) return NextResponse.redirect(`${site}/email-verified?status=invalid`);
  return NextResponse.redirect(`${site}/email-verified?token=${encodeURIComponent(token)}`);
}

/** POST：使用者在確認頁按下按鈕後才真正執行驗證 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  if (!token) return NextResponse.json({ status: "invalid" });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").eq("verify_token", token).maybeSingle();
  if (!member || isExpired(member.verify_token_expires)) {
    return NextResponse.json({ status: "invalid" });
  }

  await supabase.from("members").update({ email_verified: true, verify_token: null, verify_token_expires: null }).eq("id", member.id);
  return NextResponse.json({ status: "success" });
}
