import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: batches, error } = await supabase
    .from("vendor_purchase_batches")
    .select("*, vendor_platforms(id, name, order_gift_cap)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const batchIds = (batches || []).map((b) => b.id);

  const { data: items } = batchIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("*, order_items(product_name, style, unit_price, unit_price_original, order_id, orders(username))").in("batch_id", batchIds)
    : { data: [] };

  const { data: gifts } = batchIds.length
    ? await supabase.from("vendor_purchase_batch_gifts").select("*, gift_styles(style_name, threshold_amount)").in("batch_id", batchIds)
    : { data: [] };

  const { data: discountTiers } = await supabase.from("vendor_discount_tiers").select("*").eq("campaign_id", params.id).order("threshold_amount", { ascending: false });

  const result = (batches || []).map((b: any) => {
    const batchItems = (items || []).filter((it: any) => it.batch_id === b.id);
    const batchGifts = (gifts || []).filter((g: any) => g.batch_id === b.id);
    const subtotalOriginal = batchItems.reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0);

    // 依採購單原幣小計，找出符合的折扣門檻（取最高符合的門檻）
    const matchedTier = (discountTiers || []).find((t: any) => subtotalOriginal >= Number(t.threshold_amount));

    return {
      id: b.id,
      label: b.label,
      platform: b.vendor_platforms ? { id: b.vendor_platforms.id, name: b.vendor_platforms.name, orderGiftCap: b.vendor_platforms.order_gift_cap } : null,
      extraAdjustment: Number(b.extra_adjustment) || 0,
      items: batchItems.map((it: any) => ({
        id: it.id,
        orderItemId: it.order_item_id,
        username: it.order_items?.orders?.username,
        productName: it.order_items?.product_name,
        style: it.order_items?.style,
        qty: it.qty,
        unitPriceOriginal: Number(it.order_items?.unit_price_original) || 0,
      })),
      gifts: batchGifts.map((g: any) => ({
        giftStyleId: g.gift_style_id,
        styleName: g.gift_styles?.style_name,
        thresholdAmount: g.gift_styles?.threshold_amount,
        qty: g.qty,
      })),
      subtotalOriginal,
      matchedDiscountAmount: matchedTier ? Number(matchedTier.discount_amount) : 0,
      matchedThresholdAmount: matchedTier ? Number(matchedTier.threshold_amount) : null,
    };
  });

  return NextResponse.json({ batches: result });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_purchase_batches")
    .insert({ campaign_id: params.id, platform_id: body.platformId || null, label: body.label || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batch: data });
}
