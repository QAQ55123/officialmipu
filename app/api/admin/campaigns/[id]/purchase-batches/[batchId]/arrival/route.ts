import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.5節：到貨追蹤三層結構查詢。回傳這張採購單底下的廠商訂單編號 → 物流單號 → 品項(到貨狀態)，
 * 以及還沒被分配進任何物流單號的品項池（一般商品品項+滿贈品項都要能被追蹤）。
 */
export async function GET(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: batchItems } = await supabase
    .from("vendor_purchase_batch_items")
    .select("*, order_items(product_name, style, orders(username))")
    .eq("batch_id", params.batchId);

  const { data: batchGifts } = await supabase
    .from("vendor_purchase_batch_gifts")
    .select("*, gift_styles(style_name)")
    .eq("batch_id", params.batchId);

  const { data: orderNumbers } = await supabase
    .from("vendor_order_numbers")
    .select("*")
    .eq("batch_id", params.batchId)
    .order("created_at", { ascending: true });
  const orderNumberIds = (orderNumbers || []).map((o) => o.id);

  const { data: shipments } = orderNumberIds.length
    ? await supabase.from("vendor_shipments").select("*").in("vendor_order_number_id", orderNumberIds).order("created_at", { ascending: true })
    : { data: [] };
  const shipmentIds = (shipments || []).map((s) => s.id);

  const { data: shipmentItems } = shipmentIds.length
    ? await supabase
        .from("vendor_shipment_items")
        .select("*, vendor_purchase_batch_items(order_items(product_name, style, orders(username))), vendor_purchase_batch_gifts(gift_styles(style_name))")
        .in("shipment_id", shipmentIds)
    : { data: [] };

  // 算出還沒被分配進任何物流單號的數量（品項可能被拆到好幾個物流單號，只拆走一部分）
  const shippedQtyByBatchItem = new Map<string, number>();
  const shippedQtyByBatchGift = new Map<string, number>();
  (shipmentItems || []).forEach((si: any) => {
    if (si.batch_item_id) shippedQtyByBatchItem.set(si.batch_item_id, (shippedQtyByBatchItem.get(si.batch_item_id) || 0) + si.qty);
    if (si.batch_gift_id) shippedQtyByBatchGift.set(si.batch_gift_id, (shippedQtyByBatchGift.get(si.batch_gift_id) || 0) + si.qty);
  });

  const unshippedPool = [
    ...(batchItems || [])
      .map((bi: any) => ({
        type: "item" as const,
        id: bi.id,
        label: `${bi.order_items?.orders?.username || ""}：${bi.order_items?.product_name}${bi.order_items?.style ? `（${bi.order_items.style}）` : ""}`,
        remaining: bi.qty - (shippedQtyByBatchItem.get(bi.id) || 0),
      }))
      .filter((x) => x.remaining > 0),
    ...(batchGifts || [])
      .map((bg: any) => ({
        type: "gift" as const,
        id: bg.id,
        label: `滿贈：${bg.gift_styles?.style_name}`,
        remaining: bg.qty - (shippedQtyByBatchGift.get(bg.id) || 0),
      }))
      .filter((x) => x.remaining > 0),
  ];

  const tree = (orderNumbers || []).map((on) => ({
    id: on.id,
    orderNumber: on.order_number,
    shipments: (shipments || [])
      .filter((s: any) => s.vendor_order_number_id === on.id)
      .map((s: any) => ({
        id: s.id,
        trackingNumber: s.tracking_number,
        weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
        items: (shipmentItems || [])
          .filter((si: any) => si.shipment_id === s.id)
          .map((si: any) => ({
            id: si.id,
            label: si.batch_item_id
              ? `${si.vendor_purchase_batch_items?.order_items?.orders?.username || ""}：${si.vendor_purchase_batch_items?.order_items?.product_name}${si.vendor_purchase_batch_items?.order_items?.style ? `（${si.vendor_purchase_batch_items.order_items.style}）` : ""}`
              : `滿贈：${si.vendor_purchase_batch_gifts?.gift_styles?.style_name}`,
            qty: si.qty,
            arrived: si.arrived,
          })),
      })),
  }));

  return NextResponse.json({ tree, unshippedPool });
}

/** POST body: { orderNumber } — 新增一個廠商訂單編號 */
export async function POST(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderNumber = String(body.orderNumber || "").trim();
  if (!orderNumber) return NextResponse.json({ error: "請輸入廠商訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("vendor_order_numbers").insert({ batch_id: params.batchId, order_number: orderNumber }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orderNumber: data });
}
