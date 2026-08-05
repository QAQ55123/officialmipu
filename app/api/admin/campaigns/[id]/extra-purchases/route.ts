import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .select("*, gift_styles(style_name)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    extraPurchases: (data || []).map((p: any) => ({
      id: p.id,
      giftStyleId: p.gift_style_id,
      styleName: p.gift_styles?.style_name || "（款式已刪除）",
      qty: p.qty,
      note: p.note,
      orderNumber: p.order_number,
      subtotal: p.subtotal != null ? Number(p.subtotal) : null,
      createdAt: p.created_at,
    })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const giftStyleId = String(body.giftStyleId || "");
  const qty = Number(body.qty);
  if (!giftStyleId) return NextResponse.json({ error: "請選擇滿贈款式" }, { status: 400 });
  if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .insert({
      campaign_id: params.id,
      gift_style_id: giftStyleId,
      qty,
      note: body.note || null,
      order_number: body.orderNumber || null,
      subtotal: body.subtotal !== undefined && body.subtotal !== "" ? Number(body.subtotal) : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ extraPurchase: data });
}
