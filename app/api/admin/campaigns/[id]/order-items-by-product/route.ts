import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.3節：顧客欄位可搜尋下拉——回傳這個檔期裡，指定商品/款式底下所有顧客的訂單品項，
 * 供採購單品項改指派時搜尋選擇（不能亂打字，只能從這份清單裡選）。
 * query: ?productName=xxx&style=yyy
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const productName = searchParams.get("productName") || "";
  const style = searchParams.get("style") || "";
  if (!productName) return NextResponse.json({ items: [] });

  const supabase = getSupabaseAdmin();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, username, order_items(id, product_name, style, qty)")
    .eq("campaign_id", params.id);

  const matched: any[] = [];
  const orderItemIds: string[] = [];
  (orders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      if (it.product_name !== productName || (it.style || "") !== style) return;
      matched.push({ orderItemId: it.id, username: o.username, qty: it.qty });
      orderItemIds.push(it.id);
    });
  });

  // 附上每個品項目前已分配掉多少，讓店家知道還能不能接收
  const { data: allocations } = orderItemIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("order_item_id, qty").in("order_item_id", orderItemIds)
    : { data: [] };
  const allocatedByItem = new Map<string, number>();
  (allocations || []).forEach((a: any) => {
    allocatedByItem.set(a.order_item_id, (allocatedByItem.get(a.order_item_id) || 0) + a.qty);
  });

  return NextResponse.json({
    items: matched.map((m) => ({
      ...m,
      allocatedQty: allocatedByItem.get(m.orderItemId) || 0,
      remainingQty: m.qty - (allocatedByItem.get(m.orderItemId) || 0),
    })),
  });
}
