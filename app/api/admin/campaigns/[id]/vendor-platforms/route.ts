import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/vendor-platforms — 平台清單（含每個門檻等級的每款上限）
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: platforms, error } = await supabase
    .from("vendor_platforms")
    .select("*, vendor_platform_tier_caps(*)")
    .eq("campaign_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ platforms });
}

// POST /api/admin/campaigns/:id/vendor-platforms — 新增平台
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  const orderGiftCap = Number(body.orderGiftCap);
  if (!name) return NextResponse.json({ error: "請輸入平台名稱" }, { status: 400 });
  if (!isFinite(orderGiftCap) || orderGiftCap < 1) {
    return NextResponse.json({ error: "單筆上限格式不正確" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_platforms")
    .insert({ campaign_id: params.id, name, order_gift_cap: orderGiftCap })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ platform: data });
}
