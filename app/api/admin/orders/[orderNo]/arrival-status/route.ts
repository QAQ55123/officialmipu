import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { extraArrivedByGiftStyle } from "@/lib/extraPurchaseArrival";

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
    .select("id, username, campaign_id, order_items(id, product_name, style, qty, series_name_snapshot)")
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
      seriesName: it.series_name_snapshot || null,
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
    .select("id, gift_style_id, style_name_snapshot, qty")
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

  // 滿贈也要先到貨才能出貨（原本沒判斷，沒到貨的贈品也能直接勾進出貨批次）。
  // 採購單的滿贈只記款式、對不到是給哪位顧客的，所以先算出這個檔期每個款式到貨幾個，
  // 再扣掉「其他訂單已經拿走的」，剩下的才是這張訂單可以出的量。
  const giftStyleIds = Array.from(new Set((giftSelections || []).map((g: any) => g.gift_style_id).filter(Boolean)));
  const arrivedByGiftStyle = new Map<string, number>();
  const takenByGiftStyle = new Map<string, number>();
  if (giftStyleIds.length > 0 && order.campaign_id) {
    const { data: campBatches } = await supabase
      .from("vendor_purchase_batches")
      .select("id")
      .eq("campaign_id", order.campaign_id);
    const campBatchIds = (campBatches || []).map((b: any) => b.id);
    const { data: batchGifts } = campBatchIds.length
      ? await supabase.from("vendor_purchase_batch_gifts").select("id, gift_style_id").in("batch_id", campBatchIds)
      : { data: [] };
    const styleByBatchGift = new Map<string, string>((batchGifts || []).map((bg: any) => [bg.id, bg.gift_style_id]));
    const { data: arrivedRows } = (batchGifts || []).length
      ? await supabase.from("vendor_shipment_items").select("batch_gift_id, qty, arrived").eq("arrived", true)
      : { data: [] };
    (arrivedRows || []).forEach((r: any) => {
      const sid = r.batch_gift_id ? styleByBatchGift.get(r.batch_gift_id) : null;
      if (sid) arrivedByGiftStyle.set(sid, (arrivedByGiftStyle.get(sid) || 0) + r.qty);
    });

    // 其他訂單已經勾進出貨批次的滿贈，要從可用數扣掉
    const { data: campOrders } = await supabase.from("orders").select("id").eq("campaign_id", order.campaign_id);
    const campOrderIds = (campOrders || []).map((o: any) => o.id);
    const { data: allGiftSels } = campOrderIds.length
      ? await supabase.from("order_gift_selections").select("id, gift_style_id, order_id").in("order_id", campOrderIds)
      : { data: [] };
    const styleBySelId = new Map<string, string>((allGiftSels || []).map((s: any) => [s.id, s.gift_style_id]));
    const otherSelIds = (allGiftSels || []).filter((s: any) => s.order_id !== order.id).map((s: any) => s.id);
    const { data: otherShipped } = otherSelIds.length
      ? await supabase.from("shipping_batch_items").select("order_gift_selection_id, qty").in("order_gift_selection_id", otherSelIds)
      : { data: [] };
    (otherShipped || []).forEach((s: any) => {
      const sid = s.order_gift_selection_id ? styleBySelId.get(s.order_gift_selection_id) : null;
      if (sid) takenByGiftStyle.set(sid, (takenByGiftStyle.get(sid) || 0) + s.qty);
    });
  }

  // 額外採購（跟其他管道補買的滿贈）到貨的數量也要算進去
  if (order.campaign_id) {
    const extraArrived = await extraArrivedByGiftStyle(supabase, order.campaign_id);
    extraArrived.forEach((qty, styleId) => arrivedByGiftStyle.set(styleId, (arrivedByGiftStyle.get(styleId) || 0) + qty));
  }

  const gifts = (giftSelections || []).map((g: any) => {
    const batchedQty = batchedQtyByGift.get(g.id) || 0;
    const arrived = g.gift_style_id ? arrivedByGiftStyle.get(g.gift_style_id) || 0 : 0;
    const takenByOthers = g.gift_style_id ? takenByGiftStyle.get(g.gift_style_id) || 0 : 0;
    const availableForThisOrder = Math.max(0, arrived - takenByOthers);
    const arrivedQty = Math.min(g.qty, availableForThisOrder);
    return {
      giftSelectionId: g.id,
      styleName: g.style_name_snapshot,
      qty: g.qty,
      arrivedQty,
      batchedQty,
      batchableQty: Math.max(0, arrivedQty - batchedQty),
    };
  });

  return NextResponse.json({ items, gifts });
}
