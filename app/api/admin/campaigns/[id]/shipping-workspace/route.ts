import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { extraArrivedByGiftStyle } from "@/lib/extraPurchaseArrival";

export const dynamic = "force-dynamic";

/**
 * 出貨作業頁：列出這個檔期「至少有一件可出貨」的顧客，依顧客分組。
 * 每位顧客的所有品項都列出來（可出貨／未到貨／已出貨），店家才判斷得了這位顧客的東西到齊了沒。
 * 一件都還沒到的顧客不列出來，等之後到貨了會自動出現。
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
  const { data: batches } = await supabase
    .from("shipping_batches")
    .select("id, order_id, customer_shipping_fee, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  const batchIds = (batches || []).map((b: any) => b.id);
  const { data: batchItems } = batchIds.length
    ? await supabase.from("shipping_batch_items").select("shipping_batch_id, order_item_id, order_gift_selection_id, qty").in("shipping_batch_id", batchIds)
    : { data: [] };
  const shippedByItem = new Map<string, number>();
  const shippedByGift = new Map<string, number>();
  (batchItems || []).forEach((bi: any) => {
    if (bi.order_item_id) shippedByItem.set(bi.order_item_id, (shippedByItem.get(bi.order_item_id) || 0) + bi.qty);
    if (bi.order_gift_selection_id) shippedByGift.set(bi.order_gift_selection_id, (shippedByGift.get(bi.order_gift_selection_id) || 0) + bi.qty);
  });
  const batchCountByOrder = new Map<string, number>();
  // 第幾批：跟訂單管理頁一樣，依建立時間排序編號
  const batchNoById = new Map<string, number>();
  (batches || []).forEach((b: any) => {
    const n = (batchCountByOrder.get(b.order_id) || 0) + 1;
    batchCountByOrder.set(b.order_id, n);
    batchNoById.set(b.id, n);
  });
  // 每個品項在哪幾批出貨過
  const batchNosByItem = new Map<string, Set<number>>();
  const batchNosByGift = new Map<string, Set<number>>();
  (batchItems || []).forEach((bi: any) => {
    const no = batchNoById.get(bi.shipping_batch_id);
    if (!no) return;
    const key = bi.order_item_id || bi.order_gift_selection_id;
    const map = bi.order_item_id ? batchNosByItem : batchNosByGift;
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(no);
  });

  // 每個滿贈款式還有多少到貨數可以分給顧客（依訂單順序先到先給）
  // 額外採購（跟其他管道補買的滿贈）到貨的數量也要算進去
  const extraArrived = await extraArrivedByGiftStyle(supabase, params.id);
  extraArrived.forEach((qty, styleId) => arrivedByGiftStyle.set(styleId, (arrivedByGiftStyle.get(styleId) || 0) + qty));
  const giftStyleRemaining = new Map<string, number>(arrivedByGiftStyle);

  const customers = orders
    .map((o: any) => {
      // 每一件都列出來：ordered 訂購數、shipped 已出貨、shippable 已到貨可出貨、notArrived 還沒到
      const itemLines = (o.order_items || []).map((it: any) => {
        const ordered = Number(it.qty) || 0;
        const arrived = Math.min(ordered, arrivedByItem.get(it.id) || 0);
        const shipped = shippedByItem.get(it.id) || 0;
        return {
          type: "item" as const,
          id: it.id,
          seriesName: it.series_name_snapshot || "",
          name: it.product_name,
          style: it.style || "",
          ordered,
          shipped,
          shippable: Math.max(0, arrived - shipped),
          notArrived: Math.max(0, ordered - Math.max(arrived, shipped)),
          batchNos: Array.from(batchNosByItem.get(it.id) || []).sort((x, y) => x - y),
          isGift: false,
        };
      });

      // 滿贈品項比照一般商品，同樣可以被勾進出貨批次（運費算0）。
      // 採購單的滿贈只記款式、對不到是給哪位顧客的，所以依訂單順序把到貨數分配下去（先下單的先拿）
      const giftLines = (o.order_gift_selections || []).map((g: any) => {
        const ordered = Number(g.qty) || 0;
        const shipped = shippedByGift.get(g.id) || 0;
        const styleLeft = g.gift_style_id ? giftStyleRemaining.get(g.gift_style_id) ?? 0 : 0;
        const canTake = Math.min(ordered, styleLeft);
        if (g.gift_style_id) giftStyleRemaining.set(g.gift_style_id, styleLeft - canTake);
        return {
          type: "gift" as const,
          id: g.id,
          seriesName: "",
          name: g.style_name_snapshot,
          style: "",
          ordered,
          shipped,
          shippable: Math.max(0, canTake - shipped),
          notArrived: Math.max(0, ordered - Math.max(canTake, shipped)),
          batchNos: Array.from(batchNosByGift.get(g.id) || []).sort((x, y) => x - y),
          isGift: true,
        };
      });

      const lines = [...itemLines, ...giftLines];
      const labelOf = (bi: any) => {
        if (bi.order_gift_selection_id) {
          const g = giftLines.find((x: any) => x.id === bi.order_gift_selection_id);
          return `滿贈 ${g?.name || ""}`;
        }
        const it = itemLines.find((x: any) => x.id === bi.order_item_id);
        return it ? `${it.seriesName ? `${it.seriesName} / ` : ""}${it.name}${it.style ? `（${it.style}）` : ""}` : "";
      };
      const shippedBatches = (batches || [])
        .filter((b: any) => b.order_id === o.id)
        .map((b: any) => ({
          id: b.id,
          batchNo: batchNoById.get(b.id) || 0,
          customerShippingFee: Number(b.customer_shipping_fee) || 0,
          items: (batchItems || [])
            .filter((bi: any) => bi.shipping_batch_id === b.id)
            .map((bi: any) => ({ label: labelOf(bi), qty: bi.qty })),
        }));

      return {
        orderId: o.id,
        orderNo: o.order_no,
        username: o.username,
        shippedBatchCount: batchCountByOrder.get(o.id) || 0,
        notArrivedCount: lines.reduce((sum: number, l: any) => sum + l.notArrived, 0),
        lines,
        items: lines.filter((l: any) => l.shippable > 0), // 可以勾選出貨的
        shippedBatches,
      };
    })
    .filter((c: any) => c.items.length > 0);

  return NextResponse.json({ customers });
}
