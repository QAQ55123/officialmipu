import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/campaigns — 檔期列表
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

// POST /api/admin/campaigns — 新增檔期
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  const opensAt = body.opensAt;
  const closesAt = body.closesAt;

  if (!name) return NextResponse.json({ error: "請輸入檔期名稱" }, { status: 400 });
  if (!opensAt || !closesAt) {
    return NextResponse.json({ error: "請設定開放起訖時間" }, { status: 400 });
  }
  if (new Date(opensAt) >= new Date(closesAt)) {
    return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name,
      opens_at: opensAt,
      closes_at: closesAt,
      gift_base_unit: body.giftBaseUnit ?? 100,
      vendor_order_gift_cap: body.vendorOrderGiftCap ?? null,
      cod_campaign_cap: body.codCampaignCap ?? null,
      // 8種交易組合：只在有明確帶值時才覆寫，否則用資料庫預設值
      ...(body.rates || {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
