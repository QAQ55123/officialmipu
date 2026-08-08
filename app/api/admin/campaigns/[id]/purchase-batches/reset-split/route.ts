import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * 全部重新分配：把所有「尚未採購」的採購單清空，讓裡面的品項回到未分配池，
 * 之後再呼叫 auto-split 重新拆一次，就能一次算到最好。
 *
 * 「已採購」＝這張採購單底下已經登記了廠商訂單編號，代表實際已經跟廠商下單了，
 * 不能被自動流程動到（品項也不會被抓回去重算），但店家仍然可以手動刪除。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: batches } = await supabase.from("vendor_purchase_batches").select("id").eq("campaign_id", params.id);
  const batchIds = (batches || []).map((b: any) => b.id);
  if (batchIds.length === 0) return NextResponse.json({ ok: true, deletedCount: 0, keptCount: 0 });

  // 已經登記廠商訂單編號的採購單＝已採購，要保留
  const { data: orderNumbers } = await supabase.from("vendor_order_numbers").select("batch_id").in("batch_id", batchIds);
  const purchasedBatchIds = new Set((orderNumbers || []).map((o: any) => o.batch_id));

  const deletableIds = batchIds.filter((id) => !purchasedBatchIds.has(id));
  if (deletableIds.length === 0) {
    return NextResponse.json({ ok: true, deletedCount: 0, keptCount: batchIds.length });
  }

  const { error } = await supabase.from("vendor_purchase_batches").delete().in("id", deletableIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deletedCount: deletableIds.length, keptCount: purchasedBatchIds.size });
}
