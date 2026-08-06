import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isExpired, getSiteUrl } from "@/lib/tokens";

/**
 * 同顧客端 verify-email 的處理方式：GET 只顯示確認頁，不做驗證動作，
 * 避免 Gmail 等信箱服務的安全掃描機器人搶先把 token 用掉，導致使用者自己點的時候顯示「已過期」。
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const site = getSiteUrl();
  if (!token) return NextResponse.redirect(`${site}/email-verified?status=invalid&returnTo=/admin`);
  return NextResponse.redirect(`${site}/email-verified?token=${encodeURIComponent(token)}&scope=admin&returnTo=/admin`);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  if (!token) return NextResponse.json({ status: "invalid" });

  const supabase = getSupabaseAdmin();
  const { data: admin } = await supabase.from("admins").select("*").eq("verify_token", token).maybeSingle();
  if (!admin || isExpired(admin.verify_token_expires)) {
    return NextResponse.json({ status: "invalid" });
  }

  await supabase.from("admins").update({ email_verified: true, verify_token: null, verify_token_expires: null }).eq("id", admin.id);
  return NextResponse.json({ status: "success" });
}
