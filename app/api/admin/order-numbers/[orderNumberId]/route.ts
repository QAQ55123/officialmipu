import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { scheduleCostSync, campaignIdOfVendorOrderNumber } from "@/lib/costSync";

export async function DELETE(req: Request, { params }: { params: { orderNumberId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const campaignId = await campaignIdOfVendorOrderNumber(supabase, params.orderNumberId); // 刪除前先查
  const { error } = await supabase.from("vendor_order_numbers").delete().eq("id", params.orderNumberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 底下的物流單（含重量）一起被刪，運費成本會變
  scheduleCostSync(campaignId);
  return NextResponse.json({ ok: true });
}

/** POST body: { trackingNumber } — 在這個廠商訂單編號底下新增一個物流單號 */
export async function POST(req: Request, { params }: { params: { orderNumberId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_shipments")
    .insert({ vendor_order_number_id: params.orderNumberId, tracking_number: body.trackingNumber || null, weight_kg: body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg) })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.weight_kg != null) scheduleCostSync(await campaignIdOfVendorOrderNumber(supabase, params.orderNumberId));
  return NextResponse.json({ shipment: data });
}
