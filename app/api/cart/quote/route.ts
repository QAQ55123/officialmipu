import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { splitIntoGroups, totalQuota, styleMaxForGroup, GiftableItem } from "@/lib/giftQuota";

/**
 * POST /api/cart/quote
 * body: { campaignId, items: [{ productVariantId, qty }] }
 *
 * 回傳這張購物車「真實可得」的滿贈總quota與各款式上限，
 * 不需要等其他顧客、也不用等檔期結束，結帳當下就能算完（2.7節）。
 *
 * 重要：滿贈門檻/quota計算用的是「商品原幣金額」，不是台幣——
 * 匯率換算（2.6節，8種組合各自的匯率）只影響顧客最終付多少台幣，
 * 兩者是分開的兩件事，避免「還沒選交易方式就不知道匯率」的雞生蛋問題。
 */
export async function POST(req: Request) {
  const body = await req.json();
  const campaignId = body.campaignId as string;
  const items: { productVariantId: string; qty: number }[] = body.items || [];

  if (!campaignId || items.length === 0) {
    return NextResponse.json({ error: "缺少檔期或購物車商品" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("gift_base_unit, vendor_order_gift_cap")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const variantIds = items.map((i) => i.productVariantId);
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id, products(amount)")
    .in("id", variantIds);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  const { data: giftStyles, error: giftStyleError } = await supabase
    .from("gift_styles")
    .select("id, style_name, threshold_amount")
    .eq("campaign_id", campaignId);
  if (giftStyleError) return NextResponse.json({ error: giftStyleError.message }, { status: 500 });

  // 組成給拆單演算法用的品項清單（單件商品金額不可切割：qty>1時展開成多個獨立單位）
  const giftableItems: GiftableItem[] = [];
  for (const cartItem of items) {
    const variant = (variants || []).find((v: any) => v.id === cartItem.productVariantId);
    if (!variant) continue;
    const unitAmount = (variant as any).products?.amount ?? 0;
    for (let i = 0; i < cartItem.qty; i++) {
      giftableItems.push({ id: `${cartItem.productVariantId}-${i}`, amountTwd: unitAmount });
    }
  }

  const baseUnit = campaign.gift_base_unit || 100;
  const vendorCap = campaign.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;

  const groups = splitIntoGroups(giftableItems, baseUnit, vendorCap);
  const quota = totalQuota(groups);

  const styleLimits = (giftStyles || []).map((s) => {
    // 每個款式的上限 = 各分組各自算出的上限加總（跟拆單分組邏輯保持一致）
    const max = groups.reduce((sum, g) => sum + styleMaxForGroup(g.groupAmount, s.threshold_amount), 0);
    return { giftStyleId: s.id, styleName: s.style_name, max };
  });

  const cartSubtotal = giftableItems.reduce((s, i) => s + i.amountTwd, 0);

  return NextResponse.json({
    cartSubtotal,
    quota,
    styleLimits,
    groups: groups.map((g) => ({ amount: g.groupAmount, quota: g.quota })),
  });
}
