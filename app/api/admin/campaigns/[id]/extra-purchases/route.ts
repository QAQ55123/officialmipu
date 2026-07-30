import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/extra-purchases
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
  return NextResponse.json({ extraPurchases: data });
}

// POST /api/admin/campaigns/:id/extra-purchases
// body: { orderRef, giftStyleId, qty, subtotal }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const orderRef = String(body.orderRef || "").trim();
  const giftStyleId = body.giftStyleId as string;
  const qty = Number(body.qty);
  const subtotal = Number(body.subtotal);

  if (!orderRef) return NextResponse.json({ error: "請輸入訂單編號" }, { status: 400 });
  if (!giftStyleId) return NextResponse.json({ error: "請選擇款式" }, { status: 400 });
  if (!isFinite(qty) || qty < 1) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });
  if (!isFinite(subtotal)) return NextResponse.json({ error: "小計格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .insert({ campaign_id: params.id, order_ref: orderRef, gift_style_id: giftStyleId, qty, subtotal })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ extraPurchase: data });
}
