import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * 3.3節：跨顧客重新指派（挪用）。給一個「已到貨」的物流單號品項（原本屬於顧客B），
 * 把它改指派給顧客A（他的同商品同款式還沒到貨），同時：
 * ① 幫顧客A補上這筆到貨紀錄 ② 幫顧客B產生一筆欠貨紀錄（欠他這麼多，等下一批到貨優先補給他）
 * body: { targetOrderItemId } — 顧客A那個「未到貨」的訂單品項ID
 */
export async function POST(req: Request, { params }: { params: { itemId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const targetOrderItemId = String(body.targetOrderItemId || "");
  if (!targetOrderItemId) return NextResponse.json({ error: "缺少目標訂單品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: shipItem } = await supabase
    .from("vendor_shipment_items")
    .select("*, vendor_purchase_batch_items(id, batch_id, order_item_id, qty, order_items(id, product_name, style, order_id, orders(id, username, campaign_id)))")
    .eq("id", params.itemId)
    .maybeSingle();
  if (!shipItem) return NextResponse.json({ error: "找不到這筆到貨紀錄" }, { status: 404 });
  if (!shipItem.arrived) return NextResponse.json({ error: "這筆還沒到貨，不能挪用" }, { status: 400 });
  if (!shipItem.batch_item_id) return NextResponse.json({ error: "滿贈品項不支援挪用，只有一般商品品項可以" }, { status: 400 });

  const sourceBatchItem = shipItem.vendor_purchase_batch_items;
  const sourceOrderItem = sourceBatchItem?.order_items;
  if (!sourceOrderItem) return NextResponse.json({ error: "找不到來源訂單品項" }, { status: 404 });

  const { data: targetOrderItem } = await supabase
    .from("order_items")
    .select("id, product_name, style, order_id, orders(id, username, campaign_id)")
    .eq("id", targetOrderItemId)
    .maybeSingle();
  if (!targetOrderItem) return NextResponse.json({ error: "找不到目標訂單品項" }, { status: 404 });

  if (targetOrderItem.product_name !== sourceOrderItem.product_name || (targetOrderItem.style || "") !== (sourceOrderItem.style || "")) {
    return NextResponse.json({ error: "商品或款式不一致，不能挪用" }, { status: 400 });
  }

  const sourceUsername = (sourceOrderItem as any).orders?.username;
  const targetUsername = (targetOrderItem as any).orders?.username;
  const campaignId = (targetOrderItem as any).orders?.campaign_id;

  // 幫目標顧客建立一個新的採購單品項分配紀錄（掛在來源那張採購單底下），並把這筆到貨紀錄改指向它
  const { data: newBatchItem, error: newBatchItemErr } = await supabase
    .from("vendor_purchase_batch_items")
    .insert({
      batch_id: sourceBatchItem.batch_id,
      order_item_id: targetOrderItemId,
      qty: shipItem.qty,
      reassignment_note: `挪用自 ${sourceUsername || "（未知顧客）"} 的到貨，原本屬於他的這 ${shipItem.qty} 件改記為欠貨`,
    })
    .select()
    .single();
  if (newBatchItemErr || !newBatchItem) return NextResponse.json({ error: newBatchItemErr?.message || "建立分配紀錄失敗" }, { status: 500 });

  const { error: updateShipErr } = await supabase.from("vendor_shipment_items").update({ batch_item_id: newBatchItem.id }).eq("id", params.itemId);
  if (updateShipErr) return NextResponse.json({ error: updateShipErr.message }, { status: 500 });

  // 幫來源顧客產生欠貨紀錄
  const { error: backorderErr } = await supabase.from("backorders").insert({
    campaign_id: campaignId,
    username: sourceUsername,
    product_name: sourceOrderItem.product_name,
    style: sourceOrderItem.style || "",
    qty: shipItem.qty,
  });
  if (backorderErr) console.error("建立欠貨紀錄失敗：", backorderErr.message);

  return NextResponse.json({ ok: true, message: `已把這 ${shipItem.qty} 件改分配給 ${targetUsername}，${sourceUsername} 已產生欠貨紀錄` });
}
