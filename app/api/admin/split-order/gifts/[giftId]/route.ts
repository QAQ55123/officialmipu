import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// PATCH /api/admin/split-order/gifts/:giftId — 調整數量（body: { qty }）
export async function PATCH(req: Request, { params }: { params: { giftId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const qty = Number(body.qty);
  if (!isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "數量至少為1，要移除請用刪除" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_purchase_order_gifts")
    .update({ qty })
    .eq("id", params.giftId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift: data });
}

// DELETE /api/admin/split-order/gifts/:giftId
export async function DELETE(req: Request, { params }: { params: { giftId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_purchase_order_gifts").delete().eq("id", params.giftId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
