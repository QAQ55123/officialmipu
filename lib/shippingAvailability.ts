import { selectEq, selectIn } from "@/lib/dbBatch";
import { extraArrivedByGiftStyle } from "@/lib/extraPurchaseArrival";

/**
 * 一個檔期的「到貨／已出貨」狀態。出貨作業頁的顯示、以及建立出貨批次前的檢查都用這一份，
 * 兩邊算出來的「還能出幾件」才會一致。所有查詢都分批讀完，不會被 Supabase 的 1000 筆上限截掉。
 */
export type CampaignShipping = {
  orders: any[]; // 依下單時間排序，含 order_items、order_gift_selections
  arrivedByItem: Map<string, number>; // 訂單品項 → 已到貨數
  shippedByItem: Map<string, number>; // 訂單品項 → 已在出貨批次的數量
  shippedByGift: Map<string, number>; // 滿贈選擇 → 已在出貨批次的數量
  arrivedByGiftStyle: Map<string, number>; // 滿贈款式 → 已到貨數（含額外採購）
  batches: any[]; // 這個檔期的出貨批次（依建立時間排序）
  batchItems: any[]; // 出貨批次裡的品項
};

function add(map: Map<string, number>, key: string | null | undefined, qty: any) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(qty) || 0));
}

export async function loadCampaignShipping(supabase: any, campaignId: string): Promise<CampaignShipping> {
  const orders = await selectEq(
    supabase,
    "orders",
    "id, order_no, username, created_at, order_items(id, product_name, style, qty, series_name_snapshot), order_gift_selections(id, gift_style_id, style_name_snapshot, qty)",
    "campaign_id",
    campaignId
  );
  orders.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const orderIds = orders.map((o: any) => o.id);
  const allItemIds = orders.flatMap((o: any) => (o.order_items || []).map((it: any) => it.id));

  // 一般商品的到貨：物流單品項連的是採購單品項，要透過採購單品項才對得回訂單品項
  const batchItemLinks = await selectIn(supabase, "vendor_purchase_batch_items", "id, order_item_id", "order_item_id", allItemIds);
  const orderItemByBatchItem = new Map<string, string>(batchItemLinks.map((bi: any) => [bi.id, bi.order_item_id]));
  const arrivedItemRows = await selectIn(
    supabase,
    "vendor_shipment_items",
    "id, batch_item_id, qty, arrived",
    "batch_item_id",
    batchItemLinks.map((bi: any) => bi.id)
  );
  const arrivedByItem = new Map<string, number>();
  arrivedItemRows.forEach((si: any) => {
    if (si.arrived) add(arrivedByItem, orderItemByBatchItem.get(si.batch_item_id), si.qty);
  });

  // 滿贈的到貨：採購單的滿贈只記款式，只查這個檔期採購單裡的滿贈
  const purchaseBatches = await selectEq(supabase, "vendor_purchase_batches", "id", "campaign_id", campaignId);
  const batchGifts = await selectIn(
    supabase,
    "vendor_purchase_batch_gifts",
    "id, gift_style_id",
    "batch_id",
    purchaseBatches.map((b: any) => b.id)
  );
  const styleByBatchGift = new Map<string, string>(batchGifts.map((bg: any) => [bg.id, bg.gift_style_id]));
  const arrivedGiftRows = await selectIn(
    supabase,
    "vendor_shipment_items",
    "id, batch_gift_id, qty, arrived",
    "batch_gift_id",
    batchGifts.map((bg: any) => bg.id)
  );
  const arrivedByGiftStyle = new Map<string, number>();
  arrivedGiftRows.forEach((si: any) => {
    if (si.arrived) add(arrivedByGiftStyle, styleByBatchGift.get(si.batch_gift_id), si.qty);
  });
  // 額外採購（跟其他管道補買的滿贈）到貨的數量也要算進去
  const extraArrived = await extraArrivedByGiftStyle(supabase, campaignId);
  extraArrived.forEach((qty, styleId) => add(arrivedByGiftStyle, styleId, qty));

  // 已經歸進出貨批次的數量
  const batches = await selectIn(supabase, "shipping_batches", "id, order_id, customer_shipping_fee, created_at", "order_id", orderIds);
  batches.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const batchItems = await selectIn(
    supabase,
    "shipping_batch_items",
    "id, shipping_batch_id, order_item_id, order_gift_selection_id, qty",
    "shipping_batch_id",
    batches.map((b: any) => b.id)
  );
  const shippedByItem = new Map<string, number>();
  const shippedByGift = new Map<string, number>();
  batchItems.forEach((bi: any) => {
    add(shippedByItem, bi.order_item_id, bi.qty);
    add(shippedByGift, bi.order_gift_selection_id, bi.qty);
  });

  return { orders, arrivedByItem, shippedByItem, shippedByGift, arrivedByGiftStyle, batches, batchItems };
}

/**
 * 建立出貨批次前的檢查：這次要出的數量，加上已經出貨的，不能超過已到貨的數量。
 * 重複按「建立出貨批次」時，第二次就會被這裡擋下來。
 * 一般商品：逐件比對（已出貨 + 這次 ≤ 已到貨，也不超過訂購數）。
 * 滿贈：採購單的滿贈對不到是哪位顧客的，所以以「款式」為單位比對（整個檔期已出貨 + 這次 ≤ 這款到貨數），
 *       同時每位顧客不能超過自己選的數量。
 * 回傳錯誤訊息；沒問題回傳 null。
 */
export function checkShippingPicks(data: CampaignShipping, picks: { type: "item" | "gift"; id: string; qty: number }[]): string | null {
  const itemById = new Map<string, any>();
  const giftById = new Map<string, any>();
  data.orders.forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => itemById.set(it.id, it));
    (o.order_gift_selections || []).forEach((g: any) => giftById.set(g.id, g));
  });

  const errors: string[] = [];
  const newByItem = new Map<string, number>();
  const newByGift = new Map<string, number>();
  picks.forEach((p) => {
    if (!p.qty || p.qty <= 0) return;
    add(p.type === "gift" ? newByGift : newByItem, p.id, p.qty);
  });

  newByItem.forEach((qty, id) => {
    const it = itemById.get(id);
    if (!it) return errors.push("有品項不屬於這個檔期的訂單，請重新整理頁面");
    const limit = Math.min(Number(it.qty) || 0, data.arrivedByItem.get(id) || 0);
    const shipped = data.shippedByItem.get(id) || 0;
    if (shipped + qty > limit) {
      const left = Math.max(0, limit - shipped);
      errors.push(`${it.product_name}${it.style ? `（${it.style}）` : ""}只剩 ${left} 件可出貨（已到貨 ${limit}、已出貨 ${shipped}），這次要出 ${qty} 件`);
    }
  });

  const newByStyle = new Map<string, number>();
  newByGift.forEach((qty, id) => {
    const g = giftById.get(id);
    if (!g) return errors.push("有滿贈不屬於這個檔期的訂單，請重新整理頁面");
    const shipped = data.shippedByGift.get(id) || 0;
    if (shipped + qty > (Number(g.qty) || 0)) {
      errors.push(`滿贈 ${g.style_name_snapshot} 這位顧客只選了 ${g.qty} 個、已出貨 ${shipped} 個，這次要出 ${qty} 個`);
    }
    add(newByStyle, g.gift_style_id, qty);
  });
  if (newByStyle.size > 0) {
    const shippedByStyle = new Map<string, number>();
    const nameByStyle = new Map<string, string>();
    giftById.forEach((g: any) => {
      add(shippedByStyle, g.gift_style_id, data.shippedByGift.get(g.id) || 0);
      if (g.gift_style_id) nameByStyle.set(g.gift_style_id, g.style_name_snapshot);
    });
    newByStyle.forEach((qty, styleId) => {
      const arrived = data.arrivedByGiftStyle.get(styleId) || 0;
      const shipped = shippedByStyle.get(styleId) || 0;
      if (shipped + qty > arrived) {
        errors.push(`滿贈 ${nameByStyle.get(styleId) || ""}只剩 ${Math.max(0, arrived - shipped)} 個可出貨（這款已到貨 ${arrived}、已出貨 ${shipped}），這次要出 ${qty} 個`);
      }
    });
  }

  return errors.length > 0 ? `超過可出貨數量，沒有建立批次：${errors.join("；")}` : null;
}
