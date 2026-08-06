import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { computeStyleLimits, type GiftStyleRule } from "@/lib/giftQuota";

export const dynamic = "force-dynamic";

/**
 * POST /api/cart/quote
 * body: { campaignId, items: [{ productId, qty }], picks?: { [giftStyleId]: qty } }
 *
 * 2.7節：結帳當下看到的滿贈數量就是真實會拿到的數量。
 * 每按一次加減就重算一次：依「顧客目前已經選了什麼」，算出每個款式還能選幾個。
 * 每款上限依店家在檔期設定裡指定的平台計算（結帳當下還不知道之後會下到哪個平台）。
 * 金額用原幣（不是台幣），匯率換算是結帳頁另一件事（2.6節）。
 */
export async function POST(req: Request) {
  const body = await req.json();
  const campaignId = body.campaignId as string;
  const items: { productId: string; qty: number }[] = body.items || [];
  const picks: Record<string, number> = body.picks || {};
  if (!campaignId || items.length === 0) return NextResponse.json({ error: "缺少檔期或購物車商品" }, { status: 400 });

  const supabase = getSupabase();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("gift_base_unit, vendor_order_gift_cap, checkout_gift_platform_id")
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
    .eq("campaign_id", campaignId)
    .order("threshold_amount", { ascending: true });
  if (giftStyleError) return NextResponse.json({ error: giftStyleError.message }, { status: 500 });

  // 每款上限：依店家在檔期設定指定的平台。沒指定就不套用每款上限（等同不限）
  const platformId = campaign.checkout_gift_platform_id;
  const { data: styleCaps } = platformId
    ? await supabase.from("vendor_platform_style_caps").select("gift_style_id, per_style_cap").eq("platform_id", platformId)
    : { data: [] };
  const capByStyle = new Map<string, number>();
  (styleCaps || []).forEach((c: any) => capByStyle.set(c.gift_style_id, c.per_style_cap));

  // 把購物車展開成一件一件的金額（單件商品金額不可切割）
  const itemAmounts: number[] = [];
  let cartSubtotal = 0;
  for (const cartItem of items) {
    const product = (products || []).find((p: any) => p.id === cartItem.productId);
    if (!product) continue;
    const unitAmount = Number((product as any).price) || 0;
    cartSubtotal += unitAmount * cartItem.qty;
    if ((product as any).linked_gift_style_id) continue; // 「贈品/滿贈」系列賣出的商品，不計入滿贈配額計算
    for (let i = 0; i < cartItem.qty; i++) itemAmounts.push(unitAmount);
  }

  const vendorCap = campaign.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;
  const rules: GiftStyleRule[] = (giftStyles || []).map((s: any) => ({
    id: s.id,
    thresholdAmount: Number(s.threshold_amount),
    perStyleCap: capByStyle.get(s.id) ?? Number.MAX_SAFE_INTEGER,
  }));

  // 結帳頁要把商品分兩區顯示：可拆單的、以及單價已經超過廠商上限的（每件各自一張採購單）
  const baseUnitForSplit = rules.length > 0 ? Math.min(...rules.map((r) => r.thresholdAmount)) : 0;
  const overCapProductIds: string[] = [];
  for (const cartItem of items) {
    const product = (products || []).find((p: any) => p.id === cartItem.productId);
    if (!product || (product as any).linked_gift_style_id) continue;
    const unitAmount = Number((product as any).price) || 0;
    if (baseUnitForSplit > 0 && Math.floor(unitAmount / baseUnitForSplit) > vendorCap) {
      overCapProductIds.push(cartItem.productId);
    }
  }

  if (itemAmounts.length === 0 || rules.length === 0) {
    return NextResponse.json({
      cartSubtotal,
      quota: 0,
      styleLimits: (giftStyles || []).map((s: any) => ({ giftStyleId: s.id, styleName: s.style_name, imageUrl: s.image_url, max: 0 })),
    });
  }

  const { limits, totalPossible } = computeStyleLimits(itemAmounts, vendorCap, picks, rules);
  // 另外算一次「都還沒選任何滿贈」的上限，用來判斷這個款式到底是「金額根本不夠」還是
  // 「金額夠、只是額度被已選的用掉了」——這兩種在畫面上要給不同的提示文字
  const { limits: baseLimits } = computeStyleLimits(itemAmounts, vendorCap, {}, rules);

  return NextResponse.json({
    cartSubtotal,
    quota: totalPossible,
    overCapProductIds,
    styleLimits: (giftStyles || []).map((s: any) => ({
      giftStyleId: s.id,
      styleName: s.style_name,
      imageUrl: s.image_url,
      max: limits[s.id] ?? 0,
      unlocked: (baseLimits[s.id] ?? 0) > 0,
    })),
  });
}
