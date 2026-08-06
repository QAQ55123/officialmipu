import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { splitIntoGroups, totalQuota, styleMaxForGroup, GiftableItem } from "@/lib/giftQuota";

export const dynamic = "force-dynamic";

/**
 * POST /api/cart/quote
 * body: { campaignId, items: [{ productId, qty }] }
 *
 * 2.7節：結帳當下看到的滿贈數量就是真實會拿到的數量，用第3節同一套拆單邏輯，
 * 範圍只限這張購物車。金額用原幣（不是台幣），匯率換算是結帳頁另一件事（2.6節）。
 */
export async function POST(req: Request) {
  const body = await req.json();
  const campaignId = body.campaignId as string;
  const items: { productId: string; qty: number }[] = body.items || [];
  if (!campaignId || items.length === 0) return NextResponse.json({ error: "缺少檔期或購物車商品" }, { status: 400 });

  const supabase = getSupabase();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("gift_base_unit, vendor_order_gift_cap")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const productIds = items.map((i) => i.productId);
  const { data: products, error: productError } = await supabase.from("products").select("id, price, linked_gift_style_id").in("id", productIds);
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });

  const { data: giftStyles, error: giftStyleError } = await supabase
    .from("gift_styles")
    .select("id, style_name, threshold_amount, image_url")
    .eq("campaign_id", campaignId);
  if (giftStyleError) return NextResponse.json({ error: giftStyleError.message }, { status: 500 });

  const giftableItems: GiftableItem[] = [];
  for (const cartItem of items) {
    const product = (products || []).find((p: any) => p.id === cartItem.productId);
    if (!product) continue;
    if ((product as any).linked_gift_style_id) continue; // 「贈品/滿贈」系列賣出的商品，不計入滿贈配額計算
    const unitAmount = Number((product as any).price) || 0;
    for (let i = 0; i < cartItem.qty; i++) {
      giftableItems.push({ id: `${cartItem.productId}-${i}`, amount: unitAmount });
    }
  }

  const baseUnit = campaign.gift_base_unit || 100;
  const vendorCap = campaign.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;

  const groups = splitIntoGroups(giftableItems, baseUnit, vendorCap);
  const quota = totalQuota(groups);

  // 3.2節：每個款式各自的上限＝「依門檻金額算出的上限」與「平台的每款上限」兩者取較小值。
  // 顧客結帳當下還不知道這批貨之後會下到哪個平台，所以取「所有平台中最小的那個每款上限」，
  // 最保守，確保不管之後下到哪個平台，答應顧客的數量都一定給得出來。
  const { data: allPlatforms } = await supabase.from("vendor_platforms").select("id").eq("campaign_id", campaignId);
  const platformIds = (allPlatforms || []).map((p: any) => p.id);
  const { data: styleCaps } = platformIds.length
    ? await supabase.from("vendor_platform_style_caps").select("gift_style_id, per_style_cap").in("platform_id", platformIds)
    : { data: [] };

  const minCapByStyle = new Map<string, number>();
  (styleCaps || []).forEach((c: any) => {
    const current = minCapByStyle.get(c.gift_style_id);
    minCapByStyle.set(c.gift_style_id, current == null ? c.per_style_cap : Math.min(current, c.per_style_cap));
  });

  const styleLimits = (giftStyles || []).map((s: any) => {
    const amountBasedMax = groups.reduce((sum, g) => sum + styleMaxForGroup(g.groupAmount, s.threshold_amount), 0);
    const platformCap = minCapByStyle.get(s.id);
    // 沒有設定每款上限的款式，只受金額換算上限限制；有設定的話取較小值
    const max = platformCap != null ? Math.min(amountBasedMax, platformCap) : amountBasedMax;
    return { giftStyleId: s.id, styleName: s.style_name, imageUrl: s.image_url, max };
  });

  const cartSubtotal = giftableItems.reduce((s, i) => s + i.amount, 0);

  return NextResponse.json({ cartSubtotal, quota, styleLimits });
}
