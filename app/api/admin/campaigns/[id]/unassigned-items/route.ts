import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.1節：把這個檔期所有顧客訂單的品項攤開，扣掉已經分配進某張採購單的數量，
 * 剩下的就是「還沒分配、可以拖進採購單」的池子。
 * 「贈品/滿贈」系列賣出的商品（products.linked_gift_style_id 有值）不算進這個池子，
 * 因為那不是需要跟廠商採購的商品，是歸進滿贈缺口的帳。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, username, order_items(id, product_name, style, qty, unit_price, unit_price_original)")
    .eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orderItemIds: string[] = [];
  (orders || []).forEach((o: any) => (o.order_items || []).forEach((it: any) => orderItemIds.push(it.id)));

  const { data: allocated } = orderItemIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("order_item_id, qty").in("order_item_id", orderItemIds)
    : { data: [] };
  const allocatedQtyByItem = new Map<string, number>();
  (allocated || []).forEach((a: any) => {
    allocatedQtyByItem.set(a.order_item_id, (allocatedQtyByItem.get(a.order_item_id) || 0) + a.qty);
  });

  // 找出哪些商品是滿贈系列自動建立的（有 linked_gift_style_id），這種商品名稱/款式一樣要排除
  const { data: giftProducts } = await supabase.from("products").select("name, style").not("linked_gift_style_id", "is", null);
  const giftProductKeys = new Set((giftProducts || []).map((p: any) => `${p.name}||${p.style || ""}`));

  const pool: any[] = [];
  (orders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      if (giftProductKeys.has(`${it.product_name}||${it.style || ""}`)) return; // 滿贈系列賣出的不算進採購池
      const allocatedQty = allocatedQtyByItem.get(it.id) || 0;
      const remaining = it.qty - allocatedQty;
      if (remaining > 0) {
        pool.push({
          orderItemId: it.id,
          username: o.username,
          productName: it.product_name,
          style: it.style,
          qty: remaining,
          unitPrice: Number(it.unit_price),
          unitPriceOriginal: it.unit_price_original != null ? Number(it.unit_price_original) : null,
        });
      }
    });
  });

  return NextResponse.json({ pool });
}
