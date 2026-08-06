import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * 3.3節：採購單品項的「顧客」欄位可以直接編輯對調——用搜尋下拉選一個目標訂單品項，
 * 把這筆分配改指派給那位顧客。只允許在同商品同款式之間對調（避免改錯導致對帳混亂）。
 * body: { targetOrderItemId }
 */
export async function PATCH(req: Request, { params }: { params: { id: string; batchId: string; batchItemId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const targetOrderItemId = String(body.targetOrderItemId || "");
  if (!targetOrderItemId) return NextResponse.json({ error: "請選擇要改指派給哪位顧客的品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: batchItem } = await supabase
    .from("vendor_purchase_batch_items")
    .select("id, qty, order_item_id, order_items(product_name, style, orders(username))")
    .eq("id", params.batchItemId)
    .maybeSingle();
  if (!batchItem) return NextResponse.json({ error: "找不到這筆分配紀錄" }, { status: 404 });

  const sourceItem = (batchItem as any).order_items;
  const { data: targetItem } = await supabase
    .from("order_items")
    .select("id, product_name, style, qty, orders(username)")
    .eq("id", targetOrderItemId)
    .maybeSingle();
  if (!targetItem) return NextResponse.json({ error: "找不到目標訂單品項" }, { status: 404 });

  if (targetItem.product_name !== sourceItem?.product_name || (targetItem.style || "") !== (sourceItem?.style || "")) {
    return NextResponse.json({ error: "只能對調同商品同款式的品項" }, { status: 400 });
  }

  // 確認目標訂單品項還有足夠的未分配數量可以接收
  const { data: targetAllocations } = await supabase.from("vendor_purchase_batch_items").select("qty").eq("order_item_id", targetOrderItemId);
  const targetAllocatedQty = (targetAllocations || []).reduce((s, a) => s + a.qty, 0);
  if (targetAllocatedQty + batchItem.qty > targetItem.qty) {
    return NextResponse.json(
      { error: `${(targetItem as any).orders?.username} 的這個品項只剩 ${targetItem.qty - targetAllocatedQty} 件未分配，接收不了 ${batchItem.qty} 件` },
      { status: 400 }
    );
  }

  const sourceUsername = sourceItem?.orders?.username || "（未知顧客）";
  const targetUsername = (targetItem as any).orders?.username || "（未知顧客）";

  const { error } = await supabase
    .from("vendor_purchase_batch_items")
    .update({
      order_item_id: targetOrderItemId,
      reassignment_note: `顧客欄位手動對調：原本記在 ${sourceUsername} 名下，改指派給 ${targetUsername}`,
    })
    .eq("id", params.batchItemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: `已把這 ${batchItem.qty} 件從 ${sourceUsername} 改指派給 ${targetUsername}` });
}
