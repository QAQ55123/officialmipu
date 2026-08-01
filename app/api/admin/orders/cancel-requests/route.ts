import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 列出所有申請取消、還沒審核的訂單 */
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("*, plans(name), order_items(*)")
    .not("cancel_requested_at", "is", null)
    .order("cancel_requested_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data || []).map((o: any) => ({
      orderNo: o.order_no,
      username: o.username,
      planName: o.plan_name_snapshot || o.plans?.name || "（企劃已刪除）",
      payment: o.payment,
      cancelRequestedAt: o.cancel_requested_at,
      items: (o.order_items || []).map((it: any) => ({ name: it.product_name, style: it.style, qty: it.qty, subtotal: Number(it.subtotal) })),
      total: (o.order_items || []).reduce((s: number, it: any) => s + Number(it.subtotal), 0),
    })),
  });
}

/** 核准取消：真正刪除這張訂單 body: { orderNo } */
export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, plan_id, plans(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { error } = await supabase.from("orders").delete().eq("id", order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const planName = (order as any).plans?.name;
  let syncWarning = "";
  if (order.plan_id && planName) {
    try {
      await syncOrderRealtimeToPlanTab(order.plan_id, planName);
      await syncOnePlanCostTab(order.plan_id, planName);
    } catch (e: any) {
      syncWarning = "已核准取消，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }
  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}

/** 拒絕取消：清掉申請紀錄，訂單維持有效 body: { orderNo } */
export async function DELETE(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("orders").update({ cancel_requested_at: null }).eq("order_no", orderNo);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
