import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { id: string; tierId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("thresholdAmount" in body) updates.threshold_amount = Number(body.thresholdAmount);
  if ("discountAmount" in body) updates.discount_amount = Number(body.discountAmount);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("vendor_discount_tiers").update(updates).eq("id", params.tierId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discountTier: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string; tierId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_discount_tiers").delete().eq("id", params.tierId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
