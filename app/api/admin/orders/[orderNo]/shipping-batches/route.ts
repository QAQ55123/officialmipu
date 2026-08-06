import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET：列出這張訂單已經建立的出貨批次 */
export async function GET(req: Request, { params }: { params: { orderNo: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase.from("orders").select("id").eq("order_no", params.orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { data: batches } = await supabase
    .from("shipping_batches")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const batchIds = (batches || []).map((b) => b.id);
  const { data: items } = batchIds.length
    ? await supabase
        .from("shipping_batch_items")
        .select("*, order_items(product_name, style), order_gift_selections(style_name_snapshot)")
        .in("shipping_batch_id", batchIds)
    : { data: [] };

  return NextResponse.json({
    batches: (batches || []).map((b: any) => ({
      id: b.id,
      customerShippingFee: Number(b.customer_shipping_fee) || 0,
      internalCost: b.internal_cost != null ? Number(b.internal_cost) : null,
      note: b.note,
      createdAt: b.created_at,
      items: (items || [])
        .filter((it: any) => it.shipping_batch_id === b.id)
        .map((it: any) => ({
          id: it.id,
          isGift: !!it.order_gift_selection_id,
          label: it.order_gift_selection_id
            ? `滿贈：${it.order_gift_selections?.style_name_snapshot || "（款式已刪除）"}`
            : `${it.order_items?.product_name}${it.order_items?.style ? `（${it.order_items.style}）` : ""}`,
          qty: it.qty,
          shippingFee: Number(it.shipping_fee) || 0,
        })),
    })),
  });
}

/**
 * POST：建立出貨批次。body: { items: [{ type: "item"|"gift", id, qty }] }
 * 系統會依商品設定的固定運費金額算出這批的顧客運費加總（滿贈品項運費固定0）。
 */
export async function POST(req: Request, { params }: { params: { orderNo: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const pickedItems: { type: "item" | "gift"; id: string; qty: number }[] = Array.isArray(body.items) ? body.items : [];
  if (pickedItems.length === 0) return NextResponse.json({ error: "請至少勾選一個品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, series_id").eq("order_no", params.orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  // 算運費：一般商品用該商品設定的固定運費金額（台幣），滿贈品項固定0
  const rows: any[] = [];
  let totalShippingFee = 0;
  for (const p of pickedItems) {
    if (p.qty <= 0) continue;
    if (p.type === "gift") {
      rows.push({ order_gift_selection_id: p.id, qty: p.qty, shipping_fee: 0 });
      continue;
    }
    const { data: orderItem } = await supabase.from("order_items").select("product_name, style").eq("id", p.id).maybeSingle();
    let unitShippingFee = 0;
    if (orderItem && order.series_id) {
      const { data: product } = await supabase
        .from("products")
        .select("shipping_fee")
        .eq("series_id", order.series_id)
        .eq("name", orderItem.product_name)
        .eq("style", orderItem.style || "")
        .maybeSingle();
      unitShippingFee = Number(product?.shipping_fee) || 0;
    }
    const fee = unitShippingFee * p.qty;
    totalShippingFee += fee;
    rows.push({ order_item_id: p.id, qty: p.qty, shipping_fee: fee });
  }

  if (rows.length === 0) return NextResponse.json({ error: "沒有有效的品項" }, { status: 400 });

  const { data: batch, error: batchErr } = await supabase
    .from("shipping_batches")
    .insert({ order_id: order.id, customer_shipping_fee: totalShippingFee })
    .select()
    .single();
  if (batchErr || !batch) return NextResponse.json({ error: batchErr?.message || "建立失敗" }, { status: 500 });

  const { error: itemsErr } = await supabase
    .from("shipping_batch_items")
    .insert(rows.map((r) => ({ ...r, shipping_batch_id: batch.id })));
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, batchId: batch.id, customerShippingFee: totalShippingFee });
}
