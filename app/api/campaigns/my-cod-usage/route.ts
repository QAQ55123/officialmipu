import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";

export const dynamic = "force-dynamic";

/**
 * 顧客在目前檔期已經用掉多少取付額度（一般商品／滿贈系列商品分開）。
 * 結帳頁用這個在「選取付的當下」就判斷得出額度夠不夠，不用等按下送出才被後端擋。
 * 只回傳「已用金額」，不回傳上限，上限由檔期 API 提供。
 */
export async function GET(req: Request) {
  const member = getMemberSession(req);
  if (!member) return NextResponse.json({ regularUsed: 0, giftUsed: 0 });

  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ regularUsed: 0, giftUsed: 0 });

  const { data: myOrders } = await supabase
    .from("orders")
    .select("id, order_items(product_name, style, subtotal, series_id)")
    .eq("campaign_id", campaignId)
    .eq("payment", "取付")
    .ilike("username", member.username);

  const { data: giftProds } = await supabase
    .from("products")
    .select("name, style, series_id")
    .not("linked_gift_style_id", "is", null);
  const giftKeys = new Set((giftProds || []).map((p: any) => `${p.series_id}||${p.name}||${p.style || ""}`));

  let regularUsed = 0;
  let giftUsed = 0;
  (myOrders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      const key = `${it.series_id}||${it.product_name}||${it.style || ""}`;
      if (giftKeys.has(key)) giftUsed += Number(it.subtotal) || 0;
      else regularUsed += Number(it.subtotal) || 0;
    });
  });

  return NextResponse.json({ regularUsed, giftUsed });
}
