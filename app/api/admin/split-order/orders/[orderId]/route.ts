import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/split-order/orders/:orderId — 這張採購單的品項與贈品清單
// （供到貨追蹤頁面建立物流單號時勾選要包含哪些品項用）
export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const [{ data: items, error: itemsError }, { data: gifts, error: giftsError }] = await Promise.all([
    supabase
      .from("vendor_purchase_order_items")
      .select("id, qty, members(username), order_items(product_variants(style_name, products(name)))")
      .eq("purchase_order_id", params.orderId),
    supabase
      .from("vendor_purchase_order_gifts")
      .select("id, qty, gift_styles(style_name)")
      .eq("purchase_order_id", params.orderId),
  ]);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  if (giftsError) return NextResponse.json({ error: giftsError.message }, { status: 500 });

  return NextResponse.json({
    items: (items || []).map((it: any) => ({
      id: it.id,
      qty: it.qty,
      customerName: it.members?.username ?? "",
      productName: it.order_items?.product_variants?.products?.name ?? "",
      styleName: it.order_items?.product_variants?.style_name ?? null,
    })),
    gifts: (gifts || []).map((g: any) => ({ id: g.id, qty: g.qty, styleName: g.gift_styles?.style_name ?? "" })),
  });
}

// PATCH /api/admin/split-order/orders/:orderId — 切換平台或修改額外調整欄位
export async function PATCH(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("platformId" in body) updates.platform_id = body.platformId;
  if ("adjustmentText" in body) updates.adjustment_text = body.adjustmentText;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_purchase_orders")
    .update(updates)
    .eq("id", params.orderId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
