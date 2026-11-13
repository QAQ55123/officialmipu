/**
 * 滿贈缺口的共用算法：拆單頁的「缺口總覽」和「自動分配」都用這一份，兩邊算出來的缺口才會一致。
 *
 * 每個款式：
 *   promised  顧客需要的數量 = 結帳選的滿贈（order_gift_selections）＋ 當商品賣出去的滿贈系列商品
 *   allocated 已配到採購單的數量（vendor_purchase_batch_gifts）
 *   extra     額外採購的數量（extra_purchase_items；舊資料一筆＝一個款式）
 *   gap       還缺多少 = promised − allocated − extra（≤0 代表不缺）
 *
 * 查詢都分批（.in 每批 200 筆、逐頁讀），避免 Supabase 預設 1000 筆上限截斷。
 */

export type GiftGapRow = {
  giftStyleId: string;
  styleName: string;
  thresholdAmount: number;
  promised: number;
  allocated: number;
  extra: number;
  gap: number;
};

const IN_BATCH = 200;
const PAGE = 1000;

/** 依 ids 分批 .in 查詢，並逐頁讀完 */
async function selectIn(supabase: any, table: string, columns: string, column: string, ids: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const chunk = ids.slice(i, i + IN_BATCH);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select(columns).in(column, chunk).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/** 依 campaign_id 查詢，逐頁讀完 */
async function selectByCampaign(supabase: any, table: string, columns: string, campaignId: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).eq("campaign_id", campaignId).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function add(map: Map<string, number>, key: string | null | undefined, qty: any) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + (Number(qty) || 0));
}

export async function computeGiftGap(supabase: any, campaignId: string): Promise<GiftGapRow[]> {
  const giftStyles = await selectByCampaign(supabase, "gift_styles", "id, style_name, threshold_amount", campaignId);

  const orders = await selectByCampaign(supabase, "orders", "id", campaignId);
  const orderIds = orders.map((o: any) => o.id);

  // ① 顧客需要的數量
  const promisedByStyle = new Map<string, number>();
  const selections = await selectIn(supabase, "order_gift_selections", "gift_style_id, qty", "order_id", orderIds);
  selections.forEach((s: any) => add(promisedByStyle, s.gift_style_id, s.qty));

  // 「當商品賣出去的滿贈」一樣要跟廠商拿貨，也算進需要的數量（products 上有 linked_gift_style_id 標記）
  const { data: giftProducts } = await supabase
    .from("products")
    .select("name, style, linked_gift_style_id")
    .not("linked_gift_style_id", "is", null);
  if (giftProducts && giftProducts.length > 0 && orderIds.length > 0) {
    const styleIdByKey = new Map<string, string>(
      giftProducts.map((p: any) => [`${p.name}||${p.style || ""}`, p.linked_gift_style_id])
    );
    const soldItems = await selectIn(supabase, "order_items", "product_name, style, qty", "order_id", orderIds);
    soldItems.forEach((it: any) => add(promisedByStyle, styleIdByKey.get(`${it.product_name}||${it.style || ""}`), it.qty));
  }

  // ② 已配到採購單的數量
  const batches = await selectByCampaign(supabase, "vendor_purchase_batches", "id", campaignId);
  const batchIds = batches.map((b: any) => b.id);
  const allocatedByStyle = new Map<string, number>();
  const allocations = await selectIn(supabase, "vendor_purchase_batch_gifts", "gift_style_id, qty", "batch_id", batchIds);
  allocations.forEach((a: any) => add(allocatedByStyle, a.gift_style_id, a.qty));

  // ③ 額外採購的數量（一張單可以買多個款式，數量記在款式明細上；還沒搬移的舊資料一筆＝一個款式）
  const extraByStyle = new Map<string, number>();
  const extraPurchases = await selectByCampaign(
    supabase,
    "vendor_extra_purchases",
    "gift_style_id, qty, extra_purchase_items(gift_style_id, qty)",
    campaignId
  );
  extraPurchases.forEach((e: any) => {
    const details = e.extra_purchase_items || [];
    if (details.length > 0) {
      details.forEach((d: any) => add(extraByStyle, d.gift_style_id, d.qty));
      return;
    }
    add(extraByStyle, e.gift_style_id, e.qty);
  });

  return giftStyles.map((s: any) => {
    const promised = promisedByStyle.get(s.id) || 0;
    const allocated = allocatedByStyle.get(s.id) || 0;
    const extra = extraByStyle.get(s.id) || 0;
    return {
      giftStyleId: s.id,
      styleName: s.style_name,
      thresholdAmount: Number(s.threshold_amount),
      promised,
      allocated,
      extra,
      gap: promised - allocated - extra,
    };
  });
}
