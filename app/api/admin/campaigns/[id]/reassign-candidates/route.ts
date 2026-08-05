import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.3節：跨顧客重新指派（挪用）建議清單。
 * 列出這個檔期裡「還沒到貨」的訂單品項，以及各自可以挪用的候選來源
 * （其他顧客同商品同款式、已經到貨的物流單品項）。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, username, order_items(id, product_name, style, qty)")
    .eq("campaign_id", params.id);

  const orderItemIds: string[] = [];
  (orders || []).forEach((o: any) => (o.order_items || []).forEach((it: any) => orderItemIds.push(it.id)));
  if (orderItemIds.length === 0) return NextResponse.json({ needing: [] });

  const { data: batchItems } = await supabase.from("vendor_purchase_batch_items").select("id, order_item_id").in("order_item_id", orderItemIds);
  const batchItemIds = (batchItems || []).map((b) => b.id);
  const batchItemToOrderItem = new Map((batchItems || []).map((b: any) => [b.id, b.order_item_id]));

  const { data: shipItems } = batchItemIds.length
    ? await supabase.from("vendor_shipment_items").select("id, batch_item_id, qty, arrived").in("batch_item_id", batchItemIds)
    : { data: [] };

  const arrivedQtyByOrderItem = new Map<string, number>();
  const arrivedShipItemsByOrderItem = new Map<string, { id: string; qty: number }[]>();
  (shipItems || []).forEach((si: any) => {
    if (!si.arrived) return;
    const orderItemId = batchItemToOrderItem.get(si.batch_item_id);
    if (!orderItemId) return;
    arrivedQtyByOrderItem.set(orderItemId, (arrivedQtyByOrderItem.get(orderItemId) || 0) + si.qty);
    const list = arrivedShipItemsByOrderItem.get(orderItemId) || [];
    list.push({ id: si.id, qty: si.qty });
    arrivedShipItemsByOrderItem.set(orderItemId, list);
  });

  // 找出「還沒到貨」的品項（總數量 > 已到貨數量）
  const needing: any[] = [];
  (orders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      const arrivedQty = arrivedQtyByOrderItem.get(it.id) || 0;
      const stillNeed = it.qty - arrivedQty;
      if (stillNeed <= 0) return;

      // 候選來源：其他顧客、同商品同款式、已到貨的物流品項
      const candidates: any[] = [];
      (orders || []).forEach((o2: any) => {
        if (o2.id === o.id) return;
        (o2.order_items || []).forEach((it2: any) => {
          if (it2.product_name !== it.product_name || (it2.style || "") !== (it.style || "")) return;
          const shipList = arrivedShipItemsByOrderItem.get(it2.id) || [];
          shipList.forEach((s) => {
            candidates.push({ shipmentItemId: s.id, username: o2.username, qty: s.qty });
          });
        });
      });

      if (candidates.length > 0) {
        needing.push({
          orderItemId: it.id,
          username: o.username,
          productName: it.product_name,
          style: it.style,
          stillNeed,
          candidates,
        });
      }
    });
  });

  return NextResponse.json({ needing });
}
