import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { resolveTxnRate, isCodAvailable, TxnMethod, CampaignRates } from "@/lib/txnRate";
import { ceilToTwd } from "@/lib/giftQuota";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/quote
 * body: { campaignId, txnMethod, wantsGift, items: [{productVariantId, qty}] }
 * 2.6節：結帳頁面選交易方式才顯示對應金額
 * 2.4節：取付達檔期總上限 → codAvailable=false，按鈕disable＋提示；
 *        商品層級不開放取付 → 列出被擋住的品項名稱，其他項目不受影響
 */
export async function POST(req: Request) {
  const body = await req.json();
  const campaignId = body.campaignId as string;
  const txnMethod = body.txnMethod as TxnMethod;
  const wantsGift = !!body.wantsGift;
  const items: { productVariantId: string; qty: number }[] = body.items || [];

  const supabase = getSupabase();
  const { data: campaign, error: campaignError } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const codAvailable = isCodAvailable(campaign.cod_campaign_cap, campaign.cod_campaign_used);

  const variantIds = items.map((i) => i.productVariantId);
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, products(name, amount, has_discount_flag, cod_allowed)")
    .in("id", variantIds);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  let total = 0;
  let anyDisabled = false;
  const codBlockedItems: string[] = []; // 2.4節：取付時，個別不開放取付的商品名稱

  for (const cartItem of items) {
    const variant = (variants || []).find((v: any) => v.id === cartItem.productVariantId);
    if (!variant) continue;
    const product = (variant as any).products;

    if (txnMethod === "cod" && !product.cod_allowed) {
      codBlockedItems.push(product.name);
      continue; // 這幾項不計入取付金額，但不影響其他項目（2.4節）
    }

    const { enabled, rate } = resolveTxnRate(campaign as CampaignRates, txnMethod, !!product.has_discount_flag, wantsGift);
    if (!enabled || rate == null) {
      anyDisabled = true;
      continue;
    }
    total += ceilToTwd(product.amount, rate) * cartItem.qty;
  }

  return NextResponse.json({ total, anyDisabled, codAvailable, codBlockedItems });
}
