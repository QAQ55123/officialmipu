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
    .eq("member_id", session.memberId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  return NextResponse.json({ order });
}

/** 申請取消訂單（需最高權限管理者審核，且要在檔期截止前才能申請） */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, campaigns(closes_at)")
    .eq("id", params.id)
    .eq("member_id", session.memberId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  if ((order as any).campaigns?.closes_at && new Date((order as any).campaigns.closes_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "此檔期已截止，無法申請取消訂單" }, { status: 400 });
  }
  if (order.cancel_requested_at) return NextResponse.json({ error: "已經申請過取消了，請等待審核" }, { status: 400 });

  const { error: updateError } = await supabase.from("orders").update({ cancel_requested_at: new Date().toISOString() }).eq("id", params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
