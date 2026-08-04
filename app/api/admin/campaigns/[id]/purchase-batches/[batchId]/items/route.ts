import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** POST body: { orderItemId, qty } — 把某個訂單品項的一部分數量分配進這張採購單 */
export async function POST(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderItemId = String(body.orderItemId || "");
  const qty = Number(body.qty);
  if (!orderItemId) return NextResponse.json({ error: "缺少訂單品項" }, { status: 400 });
  if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 確認這個訂單品項還有足夠的「未分配數量」可以分過來
  const { data: orderItem } = await supabase.from("order_items").select("qty").eq("id", orderItemId).maybeSingle();
  if (!orderItem) return NextResponse.json({ error: "找不到這個訂單品項" }, { status: 404 });
  const { data: existingAllocations } = await supabase.from("vendor_purchase_batch_items").select("qty").eq("order_item_id", orderItemId);
  const allocatedQty = (existingAllocations || []).reduce((s, a) => s + a.qty, 0);
  if (allocatedQty + qty > orderItem.qty) {
    return NextResponse.json({ error: `這個品項只剩 ${orderItem.qty - allocatedQty} 件還沒分配，不能分配 ${qty} 件` }, { status: 400 });
  }

  const { error } = await supabase.from("vendor_purchase_batch_items").insert({ batch_id: params.batchId, order_item_id: orderItemId, qty });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE body: { batchItemId } — 把已分配的品項移出這張採購單，回到未分配池 */
export async function DELETE(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const batchItemId = String(body.batchItemId || "");
  if (!batchItemId) return NextResponse.json({ error: "缺少品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_purchase_batch_items").delete().eq("id", batchItemId).eq("batch_id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
