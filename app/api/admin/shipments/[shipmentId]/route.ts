import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** PATCH：更新這張物流單的重量（成本表用來算運費成本）。body: { weightKg } */
export async function PATCH(req: Request, { params }: { params: { shipmentId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  const weightKg = body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg);
  if (weightKg != null && (!isFinite(weightKg) || weightKg < 0)) {
    return NextResponse.json({ error: "重量格式不正確" }, { status: 400 });
  }
  const { error } = await supabase.from("vendor_shipments").update({ weight_kg: weightKg }).eq("id", params.shipmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { shipmentId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_shipments").delete().eq("id", params.shipmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
