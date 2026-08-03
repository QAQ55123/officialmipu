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
  const { data: products, error: productError } = await supabase.from("products").select("id, price").in("id", productIds);
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
    const unitAmount = Number((product as any).price) || 0;
    for (let i = 0; i < cartItem.qty; i++) {
      giftableItems.push({ id: `${cartItem.productId}-${i}`, amount: unitAmount });
    }
  }

  const baseUnit = campaign.gift_base_unit || 100;
  const vendorCap = campaign.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;

  const groups = splitIntoGroups(giftableItems, baseUnit, vendorCap);
  const quota = totalQuota(groups);

  const styleLimits = (giftStyles || []).map((s: any) => {
    const max = groups.reduce((sum, g) => sum + styleMaxForGroup(g.groupAmount, s.threshold_amount), 0);
    return { giftStyleId: s.id, styleName: s.style_name, imageUrl: s.image_url, max };
  });

  const cartSubtotal = giftableItems.reduce((s, i) => s + i.amount, 0);

  return NextResponse.json({ cartSubtotal, quota, styleLimits });
}
