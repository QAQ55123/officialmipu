import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/split-order/order-items/:itemId
 *
 * body 有兩種用途，用 action 區分：
 *
 * 1. { action: "move", targetOrderId, moveQty }
 *    把這筆品項的部分或全部數量搬到另一張採購單（拖曳整筆或拆分數量都走這支）
 *
 * 2. { action: "reassign", newCustomerMemberId }
 *    把這筆品項的顧客欄位改成別人（同一商品跨顧客挪用），
 *    原本的顧客會自動產生一筆「欠貨」紀錄，等同商品之後到貨時系統會優先配對補齊
 */
export async function PATCH(req: Request, { params }: { params: { itemId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const { data: item, error: itemError } = await supabase
    .from("vendor_purchase_order_items")
    .select("*, order_items(product_variant_id)")
    .eq("id", params.itemId)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "找不到這筆品項" }, { status: 404 });

  if (body.action === "move") {
    const targetOrderId = body.targetOrderId as string;
    const moveQty = Number(body.moveQty);

    if (!targetOrderId || !isFinite(moveQty) || moveQty <= 0) {
      return NextResponse.json({ error: "搬移數量或目標採購單不正確" }, { status: 400 });
    }
    if (moveQty > item.qty) {
      return NextResponse.json({ error: "搬移數量不能超過這筆的總數量" }, { status: 400 });
    }

    if (moveQty === item.qty) {
      // 整筆搬過去
      const { error } = await supabase
        .from("vendor_purchase_order_items")
        .update({ purchase_order_id: targetOrderId })
        .eq("id", params.itemId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // 拆分：原本這筆扣掉搬走的數量，目標單新增一筆
      const { error: updateError } = await supabase
        .from("vendor_purchase_order_items")
        .update({ qty: item.qty - moveQty })
        .eq("id", params.itemId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

      const { error: insertError } = await supabase.from("vendor_purchase_order_items").insert({
        purchase_order_id: targetOrderId,
        order_item_id: item.order_item_id,
        customer_member_id: item.customer_member_id,
        qty: moveQty,
        unit_amount: item.unit_amount,
        reassignment_note: item.reassignment_note,
      });
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "reassign") {
    const newCustomerMemberId = body.newCustomerMemberId as string;
    if (!newCustomerMemberId) return NextResponse.json({ error: "請選擇顧客" }, { status: 400 });
    if (newCustomerMemberId === item.customer_member_id) {
      return NextResponse.json({ error: "這本來就是這位顧客" }, { status: 400 });
    }

    const { data: oldCustomer } = await supabase
      .from("members")
      .select("username")
      .eq("id", item.customer_member_id)
      .maybeSingle();

    const { error: updateError } = await supabase
      .from("vendor_purchase_order_items")
      .update({
        customer_member_id: newCustomerMemberId,
        reassignment_note: `挪用自 ${oldCustomer?.username ?? "未知顧客"}`,
      })
      .eq("id", params.itemId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    // 原本的顧客產生一筆欠貨紀錄：欠他這個款式(商品)幾個
    const { data: po } = await supabase
      .from("vendor_purchase_orders")
      .select("batch_id, vendor_purchase_batches(campaign_id)")
      .eq("id", item.purchase_order_id)
      .maybeSingle();
    const campaignId = (po as any)?.vendor_purchase_batches?.campaign_id;

    if (campaignId) {
      const { error: backorderError } = await supabase.from("backorders").insert({
        campaign_id: campaignId,
        customer_member_id: item.customer_member_id,
        product_variant_id: item.order_items?.product_variant_id ?? null,
        qty: item.qty,
        fulfilled: false,
      });
      if (backorderError) return NextResponse.json({ error: backorderError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
}
