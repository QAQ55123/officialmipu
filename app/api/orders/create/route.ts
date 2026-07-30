import { NextResponse } from "next/server";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";
import { resolveTxnRate, isCodAvailable, TxnMethod, CampaignRates } from "@/lib/txnRate";
import { ceilToTwd } from "@/lib/giftQuota";

/**
 * POST /api/orders/create
 * body: {
 *   campaignId,
 *   txnMethod: "bank" | "cod",
 *   items: [{ productVariantId, qty }],
 *   wantsGift: boolean,
 *   giftSelections: [{ giftStyleId, qty }]
 * }
 *
 * 注意：「是否標記v(滿減軌)」是每個商品各自的屬性，不是整張訂單統一的，
 * 所以同一張訂單裡不同商品可能套用不同的匯率（依各自的 hasDiscountFlag 決定），
 * 每個 order_item 各自算出自己的 unit_amount_twd，不是整單套一個費率。
 */
export async function POST(req: Request) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const body = await req.json();
  const campaignId = body.campaignId as string;
  const txnMethod = body.txnMethod as TxnMethod;
  const items: { productVariantId: string; qty: number }[] = body.items || [];
  const wantsGift = !!body.wantsGift;
  const giftSelections: { giftStyleId: string; qty: number }[] = body.giftSelections || [];

  if (!campaignId || !txnMethod || items.length === 0) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }
  if (txnMethod !== "bank" && txnMethod !== "cod") {
    return NextResponse.json({ error: "交易方式不正確" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const now = Date.now();
  const isOpen = now >= new Date(campaign.opens_at).getTime() && now <= new Date(campaign.closes_at).getTime();
  if (!isOpen) {
    return NextResponse.json({ error: "這個檔期目前不開放下單" }, { status: 400 });
  }

  // 取付總上限檢查：達標後自動關閉，不是後台警示（2.4節）
  if (txnMethod === "cod" && !isCodAvailable(campaign.cod_campaign_cap, campaign.cod_campaign_used)) {
    return NextResponse.json({ error: "本檔期取付名額已達上限，請改用匯款" }, { status: 400 });
  }

  const variantIds = items.map((i) => i.productVariantId);
  const { data: variants, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select("id, products(id, amount, has_discount_flag)")
    .in("id", variantIds);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  // 逐品項解析各自的匯率（依商品是否標記v決定走哪一軌），無條件進位算台幣單價
  const resolvedItems: {
    productVariantId: string;
    qty: number;
    unitAmountOriginal: number;
    unitAmountTwd: number;
  }[] = [];
  let anyDisabledCombo = false;

  for (const cartItem of items) {
    const variant = (variants || []).find((v: any) => v.id === cartItem.productVariantId);
    if (!variant) continue;
    const product = (variant as any).products;
    const hasDiscountFlag = !!product.has_discount_flag;

    const { enabled, rate } = resolveTxnRate(campaign as CampaignRates, txnMethod, hasDiscountFlag, wantsGift);
    if (!enabled || rate == null) {
      anyDisabledCombo = true;
      break;
    }

    resolvedItems.push({
      productVariantId: cartItem.productVariantId,
      qty: cartItem.qty,
      unitAmountOriginal: product.amount,
      unitAmountTwd: ceilToTwd(product.amount, rate),
    });
  }

  if (anyDisabledCombo) {
    return NextResponse.json(
      { error: "這個交易方式與滿贈組合目前未開放，請重新選擇" },
      { status: 400 }
    );
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({
      campaign_id: campaignId,
      member_id: session.memberId,
      txn_method: txnMethod,
      has_discount_flag: false, // 僅供參考欄位；實際判斷以每個 order_item 自己的商品flag為準
      wants_gift: wantsGift,
    })
    .select()
    .single();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const orderItemRows = resolvedItems.map((r) => ({
    order_id: order.id,
    product_variant_id: r.productVariantId,
    qty: r.qty,
    unit_amount_original: r.unitAmountOriginal,
    unit_amount_twd: r.unitAmountTwd,
  }));
  const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItemRows);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  if (wantsGift && giftSelections.length > 0) {
    const giftRows = giftSelections
      .filter((g) => g.qty > 0)
      .map((g) => ({ order_id: order.id, gift_style_id: g.giftStyleId, qty: g.qty }));
    if (giftRows.length > 0) {
      const { error: giftError } = await supabaseAdmin.from("order_gift_selections").insert(giftRows);
      if (giftError) return NextResponse.json({ error: giftError.message }, { status: 500 });
    }
  }

  // 取付累計金額更新（供檔期總上限判斷）
  if (txnMethod === "cod") {
    const orderTwdTotal = resolvedItems.reduce((s, r) => s + r.unitAmountTwd * r.qty, 0);
    await supabaseAdmin
      .from("campaigns")
      .update({ cod_campaign_used: (campaign.cod_campaign_used || 0) + orderTwdTotal })
      .eq("id", campaignId);
  }

  const totalTwd = resolvedItems.reduce((s, r) => s + r.unitAmountTwd * r.qty, 0);

  return NextResponse.json({ order, totalTwd });
}
