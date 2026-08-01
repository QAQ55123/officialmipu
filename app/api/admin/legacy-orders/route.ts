import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 查詢配對不到身份的舊訂單（僅限最高權限） */
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, username, profile_url, plan_name_snapshot, payment, paid_amount, created_at, order_items(product_name, style, qty, unit_price, subtotal)")
    .eq("legacy_unmatched", true)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: (data || []).map((o: any) => ({
      orderNo: o.order_no,
      username: o.username,
      profileUrl: o.profile_url,
      planName: o.plan_name_snapshot,
      payment: o.payment,
      paidAmount: Number(o.paid_amount) || 0,
      createdAt: o.created_at,
      items: (o.order_items || []).map((it: any) => ({ name: it.product_name, style: it.style, qty: it.qty, unitPrice: Number(it.unit_price), subtotal: Number(it.subtotal) })),
      total: (o.order_items || []).reduce((s: number, it: any) => s + Number(it.subtotal), 0),
    })),
  });
}

/** 手動把一筆訂單改指定給正確的會員帳號（僅限最高權限）body: { orderNo, targetUsername } */
export async function PATCH(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  const targetUsername = String(body.targetUsername || "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
  if (!targetUsername) return NextResponse.json({ error: "請輸入要指定的會員帳號" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: member } = await supabase.from("members").select("*").ilike("username", targetUsername).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到這個會員帳號" }, { status: 404 });

  const { data: order } = await supabase.from("orders").select("id, plan_id, plans(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { error } = await supabase
    .from("orders")
    .update({ username: member.username, profile_url: member.profile_url, legacy_unmatched: false })
    .eq("id", order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const planName = (order as any).plans?.name;
  let syncWarning = "";
  if (order.plan_id && planName) {
    try {
      await syncOrderRealtimeToPlanTab(order.plan_id, planName);
      await syncOnePlanCostTab(order.plan_id, planName);
    } catch (e: any) {
      syncWarning = "訂單擁有者已改派，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}

/** 直接刪除一筆配對不到身份的舊訂單（僅限最高權限）body: { orderNo } */
export async function DELETE(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, plan_id, plans(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  await supabase.from("order_items").delete().eq("order_id", order.id);
  const { error } = await supabase.from("orders").delete().eq("id", order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const planName = (order as any).plans?.name;
  let syncWarning = "";
  if (order.plan_id && planName) {
    try {
      await syncOrderRealtimeToPlanTab(order.plan_id, planName);
      await syncOnePlanCostTab(order.plan_id, planName);
    } catch (e: any) {
      syncWarning = "訂單已刪除，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}
