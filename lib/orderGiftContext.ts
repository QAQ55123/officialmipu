import type { GiftStyleRule } from "@/lib/giftQuota";

/**
 * 一張訂單算滿贈額度需要的資料：跟顧客結帳時（/api/cart/quote）同一套規則——
 * 用商品「原幣」單件金額、排除滿贈系列商品、每款上限依檔期指定的平台。
 */
export interface OrderGiftStyle {
  id: string;
  styleName: string;
  imageUrl: string | null;
  thresholdAmount: number;
  perStyleCap: number;
}
export interface OrderGiftRules {
  vendorCap: number;
  styles: OrderGiftStyle[];
  rules: GiftStyleRule[];
}

export async function loadCampaignGiftRules(supabase: any, campaignId: string): Promise<OrderGiftRules> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("vendor_order_gift_cap, checkout_gift_platform_id")
    .eq("id", campaignId)
    .maybeSingle();
  const { data: giftStyles } = await supabase
    .from("gift_styles")
    .select("id, style_name, threshold_amount, image_url")
    .eq("campaign_id", campaignId)
    .order("threshold_amount", { ascending: true });
  const platformId = campaign?.checkout_gift_platform_id;
  const { data: styleCaps } = platformId
    ? await supabase.from("vendor_platform_style_caps").select("gift_style_id, per_style_cap").eq("platform_id", platformId)
    : { data: [] };
  const capByStyle = new Map<string, number>();
  (styleCaps || []).forEach((c: any) => capByStyle.set(c.gift_style_id, c.per_style_cap));
  const vendorCap = campaign?.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;
  const styles: OrderGiftStyle[] = (giftStyles || []).map((s: any) => ({
    id: s.id,
    styleName: s.style_name,
    imageUrl: s.image_url,
    thresholdAmount: Number(s.threshold_amount),
    perStyleCap: capByStyle.get(s.id) ?? Number.MAX_SAFE_INTEGER,
  }));
  return {
    vendorCap,
    styles,
    rules: styles.map((s) => ({ id: s.id, thresholdAmount: s.thresholdAmount, perStyleCap: s.perStyleCap })),
  };
}

/**
 * 把訂單品項展開成一件一件的原幣金額（單件不可切割）。
 * 一般商品用下單當時的原幣單價快照；沒有快照的（例如獨立網頁專用價商品）去商品目錄查原幣價；
 * 滿贈系列商品（店家把贈品拿出來賣的）不計入。
 */
export async function orderItemAmounts(
  supabase: any,
  items: { series_id?: string | null; product_name: string; style?: string | null; qty: number; unit_price_original?: number | null; fx_rate?: number | null }[]
): Promise<number[]> {
  const amounts: number[] = [];
  const needLookup = items.filter((it) => !(it.fx_rate != null && Number(it.unit_price_original) > 0));
  const productByKey = new Map<string, any>();
  const seriesIds = Array.from(new Set(needLookup.map((it) => it.series_id).filter(Boolean))) as string[];
  if (seriesIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("series_id, name, style, price, linked_gift_style_id")
      .in("series_id", seriesIds);
    (products || []).forEach((p: any) => productByKey.set(`${p.series_id}||${p.name}||${(p.style || "").trim()}`, p));
  }
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    let unit = 0;
    if (it.fx_rate != null && Number(it.unit_price_original) > 0) {
      unit = Number(it.unit_price_original);
    } else {
      const p = productByKey.get(`${it.series_id}||${it.product_name}||${(it.style || "").trim()}`);
      if (p && !p.linked_gift_style_id) unit = Number(p.price) || 0;
    }
    if (unit <= 0) continue;
    for (let i = 0; i < qty; i++) amounts.push(unit);
  }
  return amounts;
}
