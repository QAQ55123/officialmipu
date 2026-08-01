import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/vendor-order-numbers/:vonId/shipments
export async function GET(req: Request, { params }: { params: { vonId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_shipments")
    .select("*, vendor_shipment_items(*)")
    .eq("vendor_order_number_id", params.vonId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shipments: data });
}

// POST /api/admin/vendor-order-numbers/:vonId/shipments
// body: { trackingNo, purchaseOrderItemIds: string[], purchaseOrderGiftIds: string[] }
// 一個物流單號可以只包含滿贈品項、不含任何一般商品（兩個陣列都可以是空的，但至少要有一個非空）
export async function POST(req: Request, { params }: { params: { vonId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const trackingNo = String(body.trackingNo || "").trim();
  const itemIds: string[] = body.purchaseOrderItemIds || [];
  const giftIds: string[] = body.purchaseOrderGiftIds || [];

  if (!trackingNo) return NextResponse.json({ error: "請輸入物流單號" }, { status: 400 });
  if (itemIds.length === 0 && giftIds.length === 0) {
    return NextResponse.json({ error: "請至少勾選一個品項" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: shipment, error: shipmentError } = await supabase
    .from("vendor_shipments")
    .insert({ vendor_order_number_id: params.vonId, tracking_no: trackingNo, arrived: false })
    .select()
    .single();
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });

  const rows = [
    ...itemIds.map((id) => ({ shipment_id: shipment.id, purchase_order_item_id: id, purchase_order_gift_id: null })),
    ...giftIds.map((id) => ({ shipment_id: shipment.id, purchase_order_item_id: null, purchase_order_gift_id: id })),
  ];
  const { error: itemsError } = await supabase.from("vendor_shipment_items").insert(rows);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json({ shipment });
}
