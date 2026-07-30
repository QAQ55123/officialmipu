import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * POST /api/admin/orders/:orderId/shipping-batches
 * body: { orderItemIds: string[], giftSelectionIds: string[] }
 *
 * 用「訂單品項」為單位建立出貨批次（不是整張訂單）——
 * 只能勾選已到貨的品項；運費 = 各品項固定運費金額加總（滿贈品項運費固定為0）。
 * 這裡先建立批次本身，運費金額顯示邏輯交給前端讀取 product 的 shipping_fee 加總。
 */
export async function POST(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const orderItemIds: string[] = body.orderItemIds || [];
  const giftSelectionIds: string[] = body.giftSelectionIds || [];

  if (orderItemIds.length === 0 && giftSelectionIds.length === 0) {
    return NextResponse.json({ error: "請至少勾選一個品項" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: batch, error: batchError } = await supabase
    .from("shipping_batches")
    .insert({ order_id: params.orderId, confirmed_at: new Date().toISOString() })
    .select()
    .single();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });

  const rows = [
    ...orderItemIds.map((id) => ({ batch_id: batch.id, order_item_id: id, order_gift_selection_id: null })),
    ...giftSelectionIds.map((id) => ({ batch_id: batch.id, order_item_id: null, order_gift_selection_id: id })),
  ];
  const { error: itemsError } = await supabase.from("shipping_batch_items").insert(rows);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  return NextResponse.json({ batch });
}
