import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_items(*, product_variants(style_name, products(name))), order_gift_selections(*, gift_styles(style_name))")
    .eq("id", params.id)
    .eq("member_id", session.memberId) // 只能看自己的訂單
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  return NextResponse.json({ order });
}
