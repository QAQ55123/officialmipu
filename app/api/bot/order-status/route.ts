import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireBotSecret } from "@/lib/botAuth";

export const dynamic = "force-dynamic";

/** 給 Discord 喊單 Bot 用：查詢一個訂單編號存不存在 ?orderNo=123456
 *  取代 Bot 原本掃描 Google Sheet 建索引的做法，改直接查資料庫，比較快也不會佔用 Sheets API 配額 */
export async function GET(req: Request) {
  try {
    requireBotSecret(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orderNo = (searchParams.get("orderNo") || "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少 orderNo" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase
    .from("orders")
    .select("order_no, username, profile_url, plan_name_snapshot")
    .eq("order_no", orderNo)
    .maybeSingle();

  if (!order) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    orderNo: order.order_no,
    username: order.username,
    profileUrl: order.profile_url,
    planName: order.plan_name_snapshot,
  });
}
