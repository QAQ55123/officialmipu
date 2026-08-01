import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/campaigns/:id/gift-styles
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gift_styles")
    .select("*")
    .eq("campaign_id", params.id)
    .order("threshold_amount");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftStyles: data });
}

// POST /api/admin/campaigns/:id/gift-styles — 新增款式登記（名稱＋門檻金額）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const styleName = String(body.styleName || "").trim();
  const thresholdAmount = Number(body.thresholdAmount);

  if (!styleName) return NextResponse.json({ error: "請輸入款式名稱" }, { status: 400 });
  if (!isFinite(thresholdAmount) || thresholdAmount <= 0) {
    return NextResponse.json({ error: "門檻金額格式不正確" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gift_styles")
    .insert({ campaign_id: params.id, style_name: styleName, threshold_amount: thresholdAmount })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftStyle: data });
}
