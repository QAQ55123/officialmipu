import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * 出貨作業頁：列出這個檔期「已到貨、還沒出貨」的品項，依顧客分組。
 * 原本要一張訂單一張訂單查、一張一張建批次，顧客一多就很難用。
 * 沒到貨的品項不列出來，等之後到貨了會自動出現。
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
    .select("id, order_no, username, order_items(id, product_name, style, qty, series_name_snapshot), order_gift_selections(id, gift_style_id, style_name_snapshot, qty)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });
  if (!orders || orders.length === 0) return NextResponse.json({ customers: [] });

  const orderIds = orders.map((o: any) => o.id);
  const allItemIds = orders.flatMap((o: any) => (o.order_items || []).map((it: any) => it.id));
  const allGiftIds = orders.flatMap((o: any) => (o.order_gift_selections || []).map((g: any) => g.id));

  // 已到貨數量：vendor_shipment_items 沒有 order_item_id，它連的是採購單品項，
  // 要透過 vendor_purchase_batch_items 才對得回訂單品項
  const { data: batchItemLinks } = allItemIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("id, order_item_id").in("order_item_id", allItemIds)
    : { data: [] };
  const orderItemByBatchItem = new Map<string, string>(
    (batchItemLinks || []).map((bi: any) => [bi.id, bi.order_item_id])
  );
  const batchItemIds = (batchItemLinks || []).map((bi: any) => bi.id);

  // 滿贈：採購單的滿贈只記款式，對不到「哪位顧客」，所以先統計每個款式到貨幾個，之後依訂單順序分配
  const { data: batchGiftLinks } = await supabase
    .from("vendor_purchase_batch_gifts")
    .select("id, gift_style_id");
  const giftStyleByBatchGift = new Map<string, string>(
    (batchGiftLinks || []).map((bg: any) => [bg.id, bg.gift_style_id])
  );

  const { data: shipmentItems } =
    batchItemIds.length > 0 || (batchGiftLinks || []).length > 0
      ? await supabase.from("vendor_shipment_items").select("batch_item_id, batch_gift_id, qty, arrived").eq("arrived", true)
      : { data: [] };

  const arrivedByItem = new Map<string, number>();
  const arrivedByGiftStyle = new Map<string, number>();
  (shipmentItems || []).forEach((si: any) => {
    if (si.batch_item_id) {
      const oiId = orderItemByBatchItem.get(si.batch_item_id);
      if (oiId) arrivedByItem.set(oiId, (arrivedByItem.get(oiId) || 0) + si.qty);
    } else if (si.batch_gift_id) {
      const styleId = giftStyleByBatchGift.get(si.batch_gift_id);
      if (styleId) arrivedByGiftStyle.set(styleId, (arrivedByGiftStyle.get(styleId) || 0) + si.qty);
    }
  });

  // 已經歸進出貨批次的數量
  const { data: batches } = await supabase.from("shipping_batches").select("id, order_id").in("order_id", orderIds);
  const batchIds = (batches || []).map((b: any) => b.id);
  const { data: batchItems } = batchIds.length
    ? await supabase.from("shipping_batch_items").select("order_item_id, order_gift_selection_id, qty").in("shipping_batch_id", batchIds)
    : { data: [] };
  const shippedByItem = new Map<string, number>();
  const shippedByGift = new Map<string, number>();
  (batchItems || []).forEach((bi: any) => {
    if (bi.order_item_id) shippedByItem.set(bi.order_item_id, (shippedByItem.get(bi.order_item_id) || 0) + bi.qty);
    if (bi.order_gift_selection_id) shippedByGift.set(bi.order_gift_selection_id, (shippedByGift.get(bi.order_gift_selection_id) || 0) + bi.qty);
  });
  const batchCountByOrder = new Map<string, number>();
  (batches || []).forEach((b: any) => batchCountByOrder.set(b.order_id, (batchCountByOrder.get(b.order_id) || 0) + 1));

  // 每個滿贈款式還有多少到貨數可以分給顧客（依訂單順序先到先給）
  const giftStyleRemaining = new Map<string, number>(arrivedByGiftStyle);

  const customers = orders
    .map((o: any) => {
      const items = (o.order_items || [])
        .map((it: any) => {
          const arrived = arrivedByItem.get(it.id) || 0;
          const shipped = shippedByItem.get(it.id) || 0;
          const shippable = Math.max(0, arrived - shipped);
          return {
            type: "item" as const,
            id: it.id,
            seriesName: it.series_name_snapshot || "",
            name: it.product_name,
            style: it.style || "",
            shippable,
            isGift: false,
          };
        })
        .filter((it: any) => it.shippable > 0);

      // 滿贈品項比照一般商品，同樣可以被勾進出貨批次（運費算0）。
      // 採購單的滿贈只記款式、對不到是給哪位顧客的，所以依訂單順序把到貨數分配下去（先下單的先拿）
      const gifts = (o.order_gift_selections || [])
        .map((g: any) => {
          const shipped = shippedByGift.get(g.id) || 0;
          const styleLeft = g.gift_style_id ? giftStyleRemaining.get(g.gift_style_id) ?? 0 : 0;
          const canTake = Math.min(g.qty, styleLeft);
          if (g.gift_style_id) giftStyleRemaining.set(g.gift_style_id, styleLeft - canTake);
          const shippable = Math.max(0, canTake - shipped);
          return {
            type: "gift" as const,
            id: g.id,
            seriesName: "",
            name: g.style_name_snapshot,
            style: "",
            shippable,
            isGift: true,
          };
        })
        .filter((g: any) => g.shippable > 0);

      return {
        orderId: o.id,
        orderNo: o.order_no,
        username: o.username,
        shippedBatchCount: batchCountByOrder.get(o.id) || 0,
        items: [...items, ...gifts],
      };
    })
    .filter((c: any) => c.items.length > 0);

  return NextResponse.json({ customers });
}
