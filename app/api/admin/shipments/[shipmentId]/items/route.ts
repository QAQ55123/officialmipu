import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** POST body: { type: "item"|"gift", id, qty } — 把一般商品品項或滿贈品項分配進這個物流單號 */
export async function POST(req: Request, { params }: { params: { shipmentId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const type = body.type as "item" | "gift";
  const id = String(body.id || "");
  const qty = Number(body.qty);
  if (!id) return NextResponse.json({ error: "缺少品項" }, { status: 400 });
  if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 確認還有足夠的「未分配到物流單號」數量可以分過來
  const sourceTable = type === "gift" ? "vendor_purchase_batch_gifts" : "vendor_purchase_batch_items";
  const linkField = type === "gift" ? "batch_gift_id" : "batch_item_id";
  const { data: source } = await supabase.from(sourceTable).select("qty").eq("id", id).maybeSingle();
  if (!source) return NextResponse.json({ error: "找不到這個品項" }, { status: 404 });
  const { data: existingShipped } = await supabase.from("vendor_shipment_items").select("qty").eq(linkField, id);
  const shippedQty = (existingShipped || []).reduce((s, r) => s + r.qty, 0);
  if (shippedQty + qty > source.qty) {
    return NextResponse.json({ error: `這個品項只剩 ${source.qty - shippedQty} 件還沒分配到物流單號` }, { status: 400 });
  }

  const insertRow: any = { shipment_id: params.shipmentId, qty };
  insertRow[linkField] = id;
  const { error } = await supabase.from("vendor_shipment_items").insert(insertRow);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
