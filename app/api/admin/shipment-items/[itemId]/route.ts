import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PATCH body: { arrived } — 切換這個物流單號品項的到貨狀態，只記到貨/未到貨兩態。
 * 3.3節：標記到貨的當下，如果這個商品/款式有對應的欠貨紀錄，系統優先自動把這批到貨數量
 * 配對給欠貨（依欠貨產生時間先後順序），欠貨補齊後紀錄消除；回傳配對結果讓前端即時顯示。
 */
export async function PATCH(req: Request, { params }: { params: { itemId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const arrived = !!body.arrived;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_shipment_items").update({ arrived }).eq("id", params.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!arrived) return NextResponse.json({ ok: true });

  // 標記到貨了，去查這個商品/款式有沒有對應的欠貨紀錄，有的話優先自動配對
  const { data: shipItem } = await supabase
    .from("vendor_shipment_items")
    .select("qty, vendor_purchase_batch_items(order_items(product_name, style, orders(campaign_id)))")
    .eq("id", params.itemId)
    .maybeSingle();
  const orderItem = (shipItem as any)?.vendor_purchase_batch_items?.order_items;
  if (!orderItem) return NextResponse.json({ ok: true });

  const campaignId = orderItem.orders?.campaign_id;
  const { data: backorders } = await supabase
    .from("backorders")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("product_name", orderItem.product_name)
    .eq("style", orderItem.style || "")
    .eq("fulfilled", false)
    .order("created_at", { ascending: true });

  let remaining = (shipItem as any)?.qty || 0;
  const matched: { username: string; qty: number }[] = [];
  for (const b of backorders || []) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.qty);
    remaining -= take;
    matched.push({ username: b.username, qty: take });
    if (take >= b.qty) {
      await supabase.from("backorders").update({ fulfilled: true }).eq("id", b.id);
    } else {
      await supabase.from("backorders").update({ qty: b.qty - take }).eq("id", b.id);
    }
  }

  return NextResponse.json({ ok: true, matchedBackorders: matched.length > 0 ? matched : undefined });
}

export async function DELETE(req: Request, { params }: { params: { itemId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_shipment_items").delete().eq("id", params.itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
