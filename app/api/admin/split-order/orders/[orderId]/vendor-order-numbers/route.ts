import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/split-order/orders/:orderId/vendor-order-numbers
export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_order_numbers")
    .select("*, vendor_shipments(*, vendor_shipment_items(*))")
    .eq("purchase_order_id", params.orderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendorOrderNumbers: data });
}

// POST /api/admin/split-order/orders/:orderId/vendor-order-numbers
// body: { vendorOrderNo }
export async function POST(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const vendorOrderNo = String(body.vendorOrderNo || "").trim();
  if (!vendorOrderNo) return NextResponse.json({ error: "請輸入廠商訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_order_numbers")
    .insert({ purchase_order_id: params.orderId, vendor_order_no: vendorOrderNo })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendorOrderNumber: data });
}
