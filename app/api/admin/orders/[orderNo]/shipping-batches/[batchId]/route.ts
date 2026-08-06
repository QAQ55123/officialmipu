import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** PATCH：填寫這批的內部物流成本（店家自己付給物流商的錢，不轉嫁顧客）。body: { internalCost, note } */
export async function PATCH(req: Request, { params }: { params: { orderNo: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("internalCost" in body) updates.internal_cost = body.internalCost === "" || body.internalCost == null ? null : Number(body.internalCost);
  if ("note" in body) updates.note = body.note || null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("shipping_batches").update(updates).eq("id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE：刪除這個出貨批次，裡面的品項會回到「還沒歸進批次」的狀態 */
export async function DELETE(req: Request, { params }: { params: { orderNo: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("shipping_batches").delete().eq("id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
