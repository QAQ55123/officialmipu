import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * 一次幫多張訂單建立出貨批次。
 * body: { picks: [{ orderId, type: "item"|"gift", id, qty }] }
 * 同一張訂單的品項會合併成一個批次，運費依商品設定的固定運費加總（滿贈固定0）。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const picks: { orderId: string; type: "item" | "gift"; id: string; qty: number }[] = body.picks || [];
  if (picks.length === 0) return NextResponse.json({ error: "請至少勾選一個品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 依訂單分組
  const byOrder = new Map<string, typeof picks>();
  picks.forEach((p) => {
    if (!p.qty || p.qty <= 0) return;
    if (!byOrder.has(p.orderId)) byOrder.set(p.orderId, []);
    byOrder.get(p.orderId)!.push(p);
  });

  // 運費：一般商品用 products.shipping_fee，滿贈固定0
  const itemIds = picks.filter((p) => p.type === "item").map((p) => p.id);
  const { data: orderItems } = itemIds.length
    ? await supabase.from("order_items").select("id, product_name, style, series_id").in("id", itemIds)
    : { data: [] };
  const { data: products } = await supabase.from("products").select("name, style, series_id, shipping_fee");
  const feeByKey = new Map(
    (products || []).map((p: any) => [`${p.series_id}||${p.name}||${p.style || ""}`, Number(p.shipping_fee) || 0])
  );
  const feeByOrderItem = new Map<string, number>();
  (orderItems || []).forEach((it: any) => {
    const key = `${it.series_id}||${it.product_name}||${it.style || ""}`;
    feeByOrderItem.set(it.id, feeByKey.get(key) || 0);
  });

  let createdCount = 0;
  const failed: string[] = [];

  for (const [orderId, rows] of byOrder) {
    const customerShippingFee = rows.reduce(
      (s, r) => s + (r.type === "item" ? (feeByOrderItem.get(r.id) || 0) * r.qty : 0),
      0
    );
    const { data: batch, error: batchErr } = await supabase
      .from("shipping_batches")
      .insert({ order_id: orderId, customer_shipping_fee: customerShippingFee })
      .select()
      .single();
    if (batchErr || !batch) {
      failed.push(batchErr?.message || "建立批次失敗");
      continue;
    }
    const itemRows = rows.map((r) => ({
      shipping_batch_id: batch.id,
      order_item_id: r.type === "item" ? r.id : null,
      order_gift_selection_id: r.type === "gift" ? r.id : null,
      qty: r.qty,
      shipping_fee: r.type === "item" ? (feeByOrderItem.get(r.id) || 0) * r.qty : 0,
    }));
    const { error: itemsErr } = await supabase.from("shipping_batch_items").insert(itemRows);
    if (itemsErr) {
      failed.push(itemsErr.message);
      continue;
    }
    createdCount++;
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `部分批次建立失敗：${failed.join("；")}`, createdCount }, { status: 500 });
  }
  return NextResponse.json({ ok: true, createdCount });
}
