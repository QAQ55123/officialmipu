import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// POST /api/admin/split-order/orders/:orderId/gifts — 新增贈品配置（或疊加既有款式的數量）
export async function POST(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const giftStyleId = body.giftStyleId as string;
  if (!giftStyleId) return NextResponse.json({ error: "請選擇款式" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("vendor_purchase_order_gifts")
    .select("*")
    .eq("purchase_order_id", params.orderId)
    .eq("gift_style_id", giftStyleId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("vendor_purchase_order_gifts")
      .update({ qty: existing.qty + 1 })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ gift: data });
  }

  const { data, error } = await supabase
    .from("vendor_purchase_order_gifts")
    .insert({ purchase_order_id: params.orderId, gift_style_id: giftStyleId, qty: 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift: data });
}
