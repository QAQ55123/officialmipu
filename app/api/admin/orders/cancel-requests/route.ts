import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/orders/cancel-requests — 列出所有申請取消、還沒審核的訂單（僅owner）
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, txn_method, cancel_requested_at, members(username), campaigns(name), order_items(qty, unit_amount_twd)")
    .not("cancel_requested_at", "is", null)
    .order("cancel_requested_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data || []).map((o: any) => ({
      orderId: o.id,
      username: o.members?.username ?? "",
      campaignName: o.campaigns?.name ?? "（檔期已刪除）",
      txnMethod: o.txn_method === "bank" ? "匯款" : "取付",
      cancelRequestedAt: o.cancel_requested_at,
      total: (o.order_items || []).reduce((s: number, it: any) => s + it.qty * it.unit_amount_twd, 0),
    })),
  });
}

// POST /api/admin/orders/cancel-requests — 核准取消：真正刪除這張訂單 body: { orderId }
export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderId = String(body.orderId || "").trim();
  if (!orderId) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/orders/cancel-requests — 拒絕取消：清掉申請紀錄，訂單維持有效 body: { orderId }
export async function DELETE(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderId = String(body.orderId || "").trim();
  if (!orderId) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("orders").update({ cancel_requested_at: null }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
