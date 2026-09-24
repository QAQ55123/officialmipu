import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * 額外採購的到貨追蹤（比照一般採購單）：
 *   廠商訂單編號 → 物流單號 → 物流單裡的款式（數量、到貨勾選）
 * 到貨勾選在最底層，所以同一張物流單裝了不同款式，可以各自勾到貨。
 *
 * POST   { action:"addOrderNumber", orderNumber }
 *        { action:"addShipment", orderNumberId, trackingNumber, weightKg }
 *        { action:"addShipmentItem", shipmentId, extraPurchaseItemId, qty }
 * PATCH  { shipmentId, trackingNumber?, weightKg? } 或 { shipmentItemId, qty?, arrived? }
 * DELETE { orderNumberId } / { shipmentId } / { shipmentItemId }
 */

function guard(req: Request) {
  try {
    requireAdminSession(req);
    return null;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

/** 某個款式明細已經開到物流單上的數量（可排除某一筆，用在修改數量時） */
async function trackedQtyOfItem(supabase: any, extraPurchaseItemId: string, excludeShipmentItemId?: string) {
  const { data } = await supabase
    .from("extra_purchase_shipment_items")
    .select("id, qty")
    .eq("extra_purchase_item_id", extraPurchaseItemId);
  return (data || []).filter((x: any) => x.id !== excludeShipmentItemId).reduce((s: number, x: any) => s + (x.qty || 0), 0);
}

async function assertItemBelongs(supabase: any, purchaseId: string, extraPurchaseItemId: string) {
  const { data } = await supabase
    .from("extra_purchase_items")
    .select("id, qty")
    .eq("id", extraPurchaseItemId)
    .eq("extra_purchase_id", purchaseId)
    .maybeSingle();
  return data;
}

export async function POST(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const { data: purchase } = await supabase
    .from("vendor_extra_purchases")
    .select("id")
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
    const { data: on } = await supabase
      .from("extra_purchase_order_numbers")
      .select("id")
      .eq("id", orderNumberId)
      .eq("extra_purchase_id", purchase.id)
      .maybeSingle();
    if (!on) return NextResponse.json({ error: "找不到這個訂單編號" }, { status: 404 });
    const w = body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg);
    const { error } = await supabase.from("extra_purchase_shipments").insert({
      order_number_id: orderNumberId,
      tracking_number: String(body.trackingNumber || "").trim() || null,
      weight_kg: w != null && isFinite(w) ? w : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "addShipmentItem") {
    const shipmentId = String(body.shipmentId || "");
    const extraPurchaseItemId = String(body.extraPurchaseItemId || "");
    const qty = Number(body.qty);
    if (!shipmentId || !extraPurchaseItemId) return NextResponse.json({ error: "請選擇要裝進這張物流單的款式" }, { status: 400 });
    if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "請輸入數量" }, { status: 400 });

    const item = await assertItemBelongs(supabase, purchase.id, extraPurchaseItemId);
    if (!item) return NextResponse.json({ error: "這個款式不屬於這筆額外採購" }, { status: 400 });

    // 同一個款式開到物流單上的數量，不能超過這張單買的數量
    const already = await trackedQtyOfItem(supabase, extraPurchaseItemId);
    if (already + qty > item.qty) {
      return NextResponse.json({ error: `這個款式共買 ${item.qty} 個，已開物流單 ${already} 個，最多還能開 ${Math.max(0, item.qty - already)} 個` }, { status: 400 });
    }
    const { error } = await supabase.from("extra_purchase_shipment_items").insert({ shipment_id: shipmentId, extra_purchase_item_id: extraPurchaseItemId, qty });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知的操作" }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  if (body.shipmentId) {
    const updates: Record<string, any> = {};
    if ("trackingNumber" in body) updates.tracking_number = String(body.trackingNumber || "").trim() || null;
    if ("weightKg" in body) {
      const w = body.weightKg === "" || body.weightKg == null ? null : Number(body.weightKg);
      if (w != null && (!isFinite(w) || w < 0)) return NextResponse.json({ error: "重量格式不正確" }, { status: 400 });
      updates.weight_kg = w;
    }
    const { error } = await supabase.from("extra_purchase_shipments").update(updates).eq("id", String(body.shipmentId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.shipmentItemId) {
    const shipmentItemId = String(body.shipmentItemId);
    const updates: Record<string, any> = {};
    if ("arrived" in body) updates.arrived = !!body.arrived;
    if ("qty" in body) {
      const qty = Number(body.qty);
      if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });
      const { data: si } = await supabase.from("extra_purchase_shipment_items").select("extra_purchase_item_id").eq("id", shipmentItemId).maybeSingle();
      if (!si) return NextResponse.json({ error: "找不到這筆物流單品項" }, { status: 404 });
      const item = await assertItemBelongs(supabase, params.purchaseId, si.extra_purchase_item_id);
      if (!item) return NextResponse.json({ error: "這個款式不屬於這筆額外採購" }, { status: 400 });
      const others = await trackedQtyOfItem(supabase, si.extra_purchase_item_id, shipmentItemId);
      if (others + qty > item.qty) {
        return NextResponse.json({ error: `這個款式共買 ${item.qty} 個，其他物流單已開 ${others} 個，這張最多 ${Math.max(0, item.qty - others)} 個` }, { status: 400 });
      }
      updates.qty = qty;
    }
    const { error } = await supabase.from("extra_purchase_shipment_items").update(updates).eq("id", shipmentItemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "缺少要修改的項目" }, { status: 400 });
}

export async function DELETE(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  if (body.shipmentItemId) {
    const { error } = await supabase.from("extra_purchase_shipment_items").delete().eq("id", String(body.shipmentItemId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.shipmentId) {
    const { error } = await supabase.from("extra_purchase_shipments").delete().eq("id", String(body.shipmentId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.orderNumberId) {
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
