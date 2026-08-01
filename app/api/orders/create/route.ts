import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";
import { resolveTxnRate, isCodAvailable, TxnMethod, CampaignRates } from "@/lib/txnRate";
import { ceilToTwd } from "@/lib/giftQuota";

/**
 * POST /api/orders/create
 * body: {
 *   campaignId, txnMethod, items: [{ productVariantId, qty }],
 *   wantsGift, giftSelections: [{ giftStyleId, qty }]
 * }
 * 注意：「是否標記v(滿減軌)」是每個商品各自的屬性，所以同一張訂單裡不同商品可能套用不同匯率，
 * 每個 order_item 各自算出自己的 unit_amount_twd。
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

  if (!campaignId || !txnMethod || items.length === 0) return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  if (txnMethod !== "bank" && txnMethod !== "cod") return NextResponse.json({ error: "交易方式不正確" }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabaseAdmin.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const now = Date.now();
  const isOpen = now >= new Date(campaign.opens_at).getTime() && now <= new Date(campaign.closes_at).getTime();
  if (!isOpen) return NextResponse.json({ error: "這個檔期目前不開放下單" }, { status: 400 });

  // 2.4節：取付達檔期總上限，按鈕本該disable，這裡是最後一道防線
  if (txnMethod === "cod" && !isCodAvailable(campaign.cod_campaign_cap, campaign.cod_campaign_used)) {
    return NextResponse.json({ error: "取付金額已超過本檔期設定的數量，請改用匯款" }, { status: 400 });
  }

  const variantIds = items.map((i) => i.productVariantId);
  const { data: variants, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select("id, style_name, amount, has_discount_flag, cod_allowed, products(id, name)")
    .in("id", variantIds);
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  // 2.4節：取付時，個別不開放取付的商品要擋住（列出品項讓顧客調整，不是整張訂單一起擋）
  if (txnMethod === "cod") {
    const blockedNames = items
      .map((i) => (variants || []).find((v: any) => v.id === i.productVariantId))
      .filter((v: any) => v && !v.cod_allowed)
      .map((v: any) => v.products?.name + (v.style_name ? `（${v.style_name}）` : ""));
    if (blockedNames.length > 0) {
      return NextResponse.json(
        { error: `以下商品不開放取付，請改用匯款或從購物車移除：${blockedNames.join("、")}` },
        { status: 400 }
      );
    }
  }

  const resolvedItems: { productVariantId: string; qty: number; unitAmountOriginal: number; unitAmountTwd: number }[] = [];
  let anyDisabledCombo = false;

  for (const cartItem of items) {
    const variant = (variants || []).find((v: any) => v.id === cartItem.productVariantId);
    if (!variant) continue;
    const v = variant as any;
    const { enabled, rate } = resolveTxnRate(campaign as CampaignRates, txnMethod, !!v.has_discount_flag, wantsGift);
    if (!enabled || rate == null) {
      anyDisabledCombo = true;
      break;
    }
    resolvedItems.push({
      productVariantId: cartItem.productVariantId,
      qty: cartItem.qty,
      unitAmountOriginal: v.amount,
      unitAmountTwd: ceilToTwd(v.amount, rate),
    });
  }

  if (anyDisabledCombo) return NextResponse.json({ error: "這個交易方式與滿贈組合目前未開放，請重新選擇" }, { status: 400 });

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .insert({ campaign_id: campaignId, member_id: session.memberId, txn_method: txnMethod, wants_gift: wantsGift })
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
    const giftRows = giftSelections.filter((g) => g.qty > 0).map((g) => ({ order_id: order.id, gift_style_id: g.giftStyleId, qty: g.qty }));
    if (giftRows.length > 0) {
      const { error: giftError } = await supabaseAdmin.from("order_gift_selections").insert(giftRows);
      if (giftError) return NextResponse.json({ error: giftError.message }, { status: 500 });
    }
  }

  if (txnMethod === "cod") {
    const orderTwdTotal = resolvedItems.reduce((s, r) => s + r.unitAmountTwd * r.qty, 0);
    await supabaseAdmin.from("campaigns").update({ cod_campaign_used: (campaign.cod_campaign_used || 0) + orderTwdTotal }).eq("id", campaignId);
  }

  const totalTwd = resolvedItems.reduce((s, r) => s + r.unitAmountTwd * r.qty, 0);
  return NextResponse.json({ order, totalTwd });
}
