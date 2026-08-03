import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 3.2節：贈品門檻＋折扣門檻表，三平台共用，店家自行輸入 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_gift_tiers")
    .select("*")
    .eq("campaign_id", params.id)
    .order("sort_order", { ascending: true })
    .order("threshold_amount", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftTiers: data });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const threshold = Number(body.thresholdAmount);
  const discount = Number(body.discountAmount);
  if (!isFinite(threshold) || threshold <= 0) return NextResponse.json({ error: "門檻金額格式不正確" }, { status: 400 });
  if (!isFinite(discount) || discount < 0) return NextResponse.json({ error: "折扣金額格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_gift_tiers")
    .insert({ campaign_id: params.id, threshold_amount: threshold, discount_amount: discount })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftTier: data });
}
