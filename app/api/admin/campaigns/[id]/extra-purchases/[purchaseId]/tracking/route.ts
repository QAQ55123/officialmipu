import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * 額外採購的到貨追蹤（比照一般採購單：訂單編號 → 物流單號 → 到貨勾選，可以分批到貨）
 *
 * POST  { action: "addOrderNumber", orderNumber }
 * POST  { action: "addShipment", orderNumberId, trackingNumber, qty, weightKg }
 * PATCH { shipmentId, arrived?, qty?, weightKg?, trackingNumber? }
 * DELETE { orderNumberId } 或 { shipmentId }
 */

async function guard(req: Request) {
  try {
    requireAdminSession(req);
    return null;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

/** 這筆額外採購底下所有物流單的數量加總（排除某一張，用在修改數量時） */
async function trackedQty(supabase: any, purchaseId: string, excludeShipmentId?: string) {
  const { data: ons } = await supabase.from("extra_purchase_order_numbers").select("id").eq("extra_purchase_id", purchaseId);
  const ids = (ons || []).map((o: any) => o.id);
  if (ids.length === 0) return 0;
  const { data: ships } = await supabase.from("extra_purchase_shipments").select("id, qty").in("order_number_id", ids);
  return (ships || []).filter((s: any) => s.id !== excludeShipmentId).reduce((s: number, x: any) => s + (x.qty || 0), 0);
}

export async function POST(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const { data: purchase } = await supabase
    .from("vendor_extra_purchases")
    .select("id, qty")
    .eq("id", params.purchaseId)
    .eq("campaign_id", params.id)
    .maybeSingle();
  if (!purchase) return NextResponse.json({ error: "找不到這筆額外採購" }, { status: 404 });

  if (body.action === "addOrderNumber") {
    const orderNumber = String(body.orderNumber || "").trim();
    if (!orderNumber) return NextResponse.json({ error: "請輸入廠商訂單編號" }, { status: 400 });
    const { error } = await supabase.from("extra_purchase_order_numbers").insert({ extra_purchase_id: purchase.id, order_number: orderNumber });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "addShipment") {
    const orderNumberId = String(body.orderNumberId || "");
    const qty = Number(body.qty);
    if (!orderNumberId) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
    if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "請輸入這張物流單的數量" }, { status: 400 });
    const { data: on } = await supabase
      .from("extra_purchase_order_numbers")
      .select("id")
      .eq("id", orderNumberId)
      .eq("extra_purchase_id", purchase.id)
      .maybeSingle();
    if (!on) return NextResponse.json({ error: "找不到這個訂單編號" }, { status: 404 });

    // 物流單數量加總不能超過這筆額外採購買的數量
    const already = await trackedQty(supabase, purchase.id);
    if (already + qty > purchase.qty) {
      return NextResponse.json({ error: `這筆額外採購共 ${purchase.qty} 個，已開物流單 ${already} 個，最多還能開 ${Math.max(0, purchase.qty - already)} 個` }, { status: 400 });
    }
    const weightKg = body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg);
    const { error } = await supabase.from("extra_purchase_shipments").insert({
      order_number_id: orderNumberId,
      tracking_number: String(body.trackingNumber || "").trim() || null,
      qty,
      weight_kg: weightKg != null && isFinite(weightKg) ? weightKg : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知的操作" }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await req.json();
  const shipmentId = String(body.shipmentId || "");
  if (!shipmentId) return NextResponse.json({ error: "缺少物流單" }, { status: 400 });
  const supabase = getSupabaseAdmin();

  const updates: Record<string, any> = {};
  if ("arrived" in body) updates.arrived = !!body.arrived;
  if ("trackingNumber" in body) updates.tracking_number = String(body.trackingNumber || "").trim() || null;
  if ("weightKg" in body) {
    const w = body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg);
    if (w != null && (!isFinite(w) || w < 0)) return NextResponse.json({ error: "重量格式不正確" }, { status: 400 });
    updates.weight_kg = w;
  }
  if ("qty" in body) {
    const qty = Number(body.qty);
    if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });
    const { data: purchase } = await supabase.from("vendor_extra_purchases").select("id, qty").eq("id", params.purchaseId).maybeSingle();
    if (!purchase) return NextResponse.json({ error: "找不到這筆額外採購" }, { status: 404 });
    const others = await trackedQty(supabase, purchase.id, shipmentId);
    if (others + qty > purchase.qty) {
      return NextResponse.json({ error: `這筆額外採購共 ${purchase.qty} 個，其他物流單已開 ${others} 個，這張最多 ${Math.max(0, purchase.qty - others)} 個` }, { status: 400 });
    }
    updates.qty = qty;
  }

  const { error } = await supabase.from("extra_purchase_shipments").update(updates).eq("id", shipmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = getSupabaseAdmin();
  if (body.shipmentId) {
    const { error } = await supabase.from("extra_purchase_shipments").delete().eq("id", String(body.shipmentId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.orderNumberId) {
    // 底下的物流單會一起刪掉（on delete cascade）
    const { error } = await supabase
      .from("extra_purchase_order_numbers")
      .delete()
      .eq("id", String(body.orderNumberId))
      .eq("extra_purchase_id", params.purchaseId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "缺少要刪除的項目" }, { status: 400 });
}
