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
    ? await supabase.from("vendor_purchase_batch_items").select("*, order_items(product_name, style, unit_price, unit_price_original, has_discount_flag_snapshot, series_name_snapshot, order_id, orders(username))").in("batch_id", batchIds)
    : { data: [] };

  const { data: gifts } = batchIds.length
    ? await supabase.from("vendor_purchase_batch_gifts").select("*, gift_styles(style_name, threshold_amount)").in("batch_id", batchIds)
    : { data: [] };

  const { data: discountTiers } = await supabase.from("vendor_discount_tiers").select("*").eq("campaign_id", params.id).order("threshold_amount", { ascending: false });

  // 到貨狀態統計：這張採購單全部品項(商品+滿贈)的總數量，跟已標記到貨的數量比較
  const { data: orderNumbers } = batchIds.length
    ? await supabase.from("vendor_order_numbers").select("id, batch_id, order_number").in("batch_id", batchIds)
    : { data: [] };
  const orderNumberIds = (orderNumbers || []).map((o) => o.id);
  const { data: shipments } = orderNumberIds.length
    ? await supabase.from("vendor_shipments").select("id, vendor_order_number_id").in("vendor_order_number_id", orderNumberIds)
    : { data: [] };
  const shipmentIds = (shipments || []).map((s) => s.id);
  const { data: shipmentItems } = shipmentIds.length
    ? await supabase.from("vendor_shipment_items").select("shipment_id, batch_item_id, batch_gift_id, qty, arrived").in("shipment_id", shipmentIds)
    : { data: [] };

  function arrivalStatusForBatch(batchId: string, batchItems: any[], batchGifts: any[]) {
    const totalQty = batchItems.reduce((s, it) => s + it.qty, 0) + batchGifts.reduce((s, g) => s + g.qty, 0);
    if (totalQty === 0) return { totalQty: 0, arrivedQty: 0 };
    const batchOrderNumberIds = new Set((orderNumbers || []).filter((o: any) => o.batch_id === batchId).map((o: any) => o.id));
    const batchShipmentIds = new Set((shipments || []).filter((s: any) => batchOrderNumberIds.has(s.vendor_order_number_id)).map((s: any) => s.id));
    const arrivedQty = (shipmentItems || [])
      .filter((si: any) => batchShipmentIds.has(si.shipment_id) && si.arrived)
      .reduce((s: number, si: any) => s + si.qty, 0);
    return { totalQty, arrivedQty };
  }

  const result = (batches || []).map((b: any) => {
    const batchItems = (items || []).filter((it: any) => it.batch_id === b.id);
    const batchGifts = (gifts || []).filter((g: any) => g.batch_id === b.id);
    const subtotalOriginal = batchItems.reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0);
    // 折扣門檻只看「有滿減標記(v)」的商品金額——無滿減商品照樣要跟廠商買，
    // 但它的金額不算進折扣門檻，不然折扣會算多
    const discountableOriginal = batchItems.reduce(
      (s: number, it: any) => s + (it.order_items?.has_discount_flag_snapshot ? (Number(it.order_items?.unit_price_original) || 0) * it.qty : 0),
      0
    );

    // 依可折金額找出符合的折扣門檻（取最高符合的門檻）
    const matchedTier = (discountTiers || []).find((t: any) => discountableOriginal >= Number(t.threshold_amount));
    const arrival = arrivalStatusForBatch(b.id, batchItems, batchGifts);

    return {
      id: b.id,
      label: b.label,
      platform: b.vendor_platforms ? { id: b.vendor_platforms.id, name: b.vendor_platforms.name, orderGiftCap: b.vendor_platforms.order_gift_cap } : null,
      items: batchItems.map((it: any) => ({
        id: it.id,
        orderItemId: it.order_item_id,
        username: it.order_items?.orders?.username,
        seriesName: it.order_items?.series_name_snapshot || null,
        productName: it.order_items?.product_name,
        style: it.order_items?.style,
        qty: it.qty,
        unitPriceOriginal: Number(it.order_items?.unit_price_original) || 0,
        reassignmentNote: it.reassignment_note || null,
      })),
      gifts: batchGifts.map((g: any) => ({
        giftStyleId: g.gift_style_id,
        styleName: g.gift_styles?.style_name,
        thresholdAmount: g.gift_styles?.threshold_amount,
        qty: g.qty,
      })),
      subtotalOriginal,
      discountableOriginal,
      matchedDiscountAmount: matchedTier ? Number(matchedTier.discount_amount) : 0,
      matchedThresholdAmount: matchedTier ? Number(matchedTier.threshold_amount) : null,
      extraAdjustment: Number(b.extra_adjustment) || 0,
      extraAdjustmentText: b.extra_adjustment_text || "",
      // 3.2節：實收 = 該單小計 − 對應門檻的廠商折扣金額 + 額外調整加總
      netReceivable: subtotalOriginal - (matchedTier ? Number(matchedTier.discount_amount) : 0) + (Number(b.extra_adjustment) || 0),
      // 有登記廠商訂單編號＝已經跟廠商下單了，「全部重新分配」時要跳過這種採購單
      vendorOrderNumbers: (orderNumbers || []).filter((o: any) => o.batch_id === b.id).map((o: any) => o.order_number),
      arrivalTotalQty: arrival.totalQty,
      arrivalArrivedQty: arrival.arrivedQty,
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
