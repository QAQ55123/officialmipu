import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { resolveTxnRate, isCodAvailable, TxnMethod, CampaignRates } from "@/lib/txnRate";
import { ceilToTwd } from "@/lib/giftQuota";

/**
 * POST /api/checkout/quote
 * body: { campaignId, txnMethod, wantsGift, items: [{productVariantId, qty}] }
 * 回傳：結帳頁面顯示用的換算後總金額（2.6節：結帳當下選交易方式才顯示對應金額）
 */
export async function POST(req: Request) {
  const body = await req.json();
  const campaignId = body.campaignId as string;
  const txnMethod = body.txnMethod as TxnMethod;
  const wantsGift = !!body.wantsGift;
  const items: { productVariantId: string; qty: number }[] = body.items || [];

  const supabase = getSupabase();
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const codAvailable = isCodAvailable(campaign.cod_campaign_cap, campaign.cod_campaign_used);

  const variantIds = items.map((i) => i.productVariantId);
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, products(amount, has_discount_flag)")
    .in("id", variantIds);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  let total = 0;
  let anyDisabled = false;
  for (const cartItem of items) {
    const variant = (variants || []).find((v: any) => v.id === cartItem.productVariantId);
    if (!variant) continue;
    const product = (variant as any).products;
    const { enabled, rate } = resolveTxnRate(campaign as CampaignRates, txnMethod, !!product.has_discount_flag, wantsGift);
    if (!enabled || rate == null) {
      anyDisabled = true;
      continue;
    }
    total += ceilToTwd(product.amount, rate) * cartItem.qty;
  }

  return NextResponse.json({ total, anyDisabled, codAvailable });
}
