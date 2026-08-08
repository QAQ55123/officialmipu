import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.3節：挪用機制的主要入口在「顧客訂單畫面」。
 * 這支 API 回傳這張訂單每一個品項的到貨狀態，未到貨的品項再附上可以挪用的候選來源
 * （其他顧客同商品同款式、已經到貨的物流單品項）。
 */
export async function GET(req: Request, { params }: { params: { orderNo: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase
    .from("orders")
    .select("id, username, campaign_id, order_items(id, product_name, style, qty)")
    .eq("order_no", params.orderNo)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  if (!order.campaign_id) return NextResponse.json({ items: [], note: "這張訂單沒有對應檔期，無法追蹤到貨狀態" });

  // 這個檔期所有訂單的品項，用來找挪用候選來源
  const { data: campaignOrders } = await supabase
    .from("orders")
    .select("id, username, order_items(id, product_name, style, qty)")
    .eq("campaign_id", order.campaign_id);

  const allOrderItemIds: string[] = [];
  (campaignOrders || []).forEach((o: any) => (o.order_items || []).forEach((it: any) => allOrderItemIds.push(it.id)));

  const { data: batchItems } = allOrderItemIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("id, order_item_id").in("order_item_id", allOrderItemIds)
    : { data: [] };
  const batchItemToOrderItem = new Map((batchItems || []).map((b: any) => [b.id, b.order_item_id]));
  const batchItemIds = (batchItems || []).map((b: any) => b.id);

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

  // 2.8節：已經被歸進出貨批次的數量，這些不能再被勾進新的批次
  const orderItemIdsOfThisOrder = (order.order_items || []).map((it: any) => it.id);
  const { data: shippedBatchItems } = orderItemIdsOfThisOrder.length
    ? await supabase.from("shipping_batch_items").select("order_item_id, qty").in("order_item_id", orderItemIdsOfThisOrder)
    : { data: [] };
  const batchedQtyByOrderItem = new Map<string, number>();
  (shippedBatchItems || []).forEach((b: any) => {
    if (!b.order_item_id) return;
    batchedQtyByOrderItem.set(b.order_item_id, (batchedQtyByOrderItem.get(b.order_item_id) || 0) + b.qty);
  });

  const items = (order.order_items || []).map((it: any) => {
    const arrivedQty = arrivedQtyByOrderItem.get(it.id) || 0;
    const stillNeed = it.qty - arrivedQty;
    const batchedQty = batchedQtyByOrderItem.get(it.id) || 0;

    // 未到貨的品項，找其他顧客同商品同款式已到貨的候選來源
    const candidates: any[] = [];
    if (stillNeed > 0) {
      (campaignOrders || []).forEach((o2: any) => {
        if (o2.id === order.id) return;
        (o2.order_items || []).forEach((it2: any) => {
          if (it2.product_name !== it.product_name || (it2.style || "") !== (it.style || "")) return;
          (arrivedShipItemsByOrderItem.get(it2.id) || []).forEach((s) => {
            candidates.push({ shipmentItemId: s.id, username: o2.username, qty: s.qty });
          });
        });
      });
    }

    return {
      orderItemId: it.id,
      productName: it.product_name,
      style: it.style,
      qty: it.qty,
      arrivedQty,
      stillNeed,
      batchedQty,
      // 已到貨、但還沒被歸進任何出貨批次的數量，這些才能被勾進新的出貨批次
      batchableQty: Math.max(0, arrivedQty - batchedQty),
      candidates,
    };
  });

  // 2.8節：滿贈品項比照一般商品，同樣要顯示到貨狀態、同樣可被勾進出貨批次（運費固定0）
  const { data: giftSelections } = await supabase
    .from("order_gift_selections")
    .select("id, style_name_snapshot, qty")
    .eq("order_id", order.id);

  const giftIds = (giftSelections || []).map((g: any) => g.id);

  // 滿贈已經被歸進哪些出貨批次
  const { data: shippedGifts } = giftIds.length
    ? await supabase.from("shipping_batch_items").select("order_gift_selection_id, qty").in("order_gift_selection_id", giftIds)
    : { data: [] };
  const batchedQtyByGift = new Map<string, number>();
  (shippedGifts || []).forEach((s: any) => {
    if (!s.order_gift_selection_id) return;
    batchedQtyByGift.set(s.order_gift_selection_id, (batchedQtyByGift.get(s.order_gift_selection_id) || 0) + s.qty);
  });

  const gifts = (giftSelections || []).map((g: any) => {
    const batchedQty = batchedQtyByGift.get(g.id) || 0;
    return {
      giftSelectionId: g.id,
      styleName: g.style_name_snapshot,
      qty: g.qty,
      batchedQty,
      // 滿贈的到貨追蹤走的是採購單那條線，這裡先讓店家能把已經拿到的贈品勾進出貨批次
      batchableQty: Math.max(0, g.qty - batchedQty),
    };
  });

  return NextResponse.json({ items, gifts });
}
