import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("campaigns").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data });
}

const RATE_FIELDS = [
  "txn_bank_discount_gift_enabled", "txn_bank_discount_gift_rate",
  "txn_bank_discount_nogift_enabled", "txn_bank_discount_nogift_rate",
  "txn_bank_nodiscount_gift_enabled", "txn_bank_nodiscount_gift_rate",
  "txn_bank_nodiscount_nogift_enabled", "txn_bank_nodiscount_nogift_rate",
  "txn_cod_discount_gift_enabled", "txn_cod_discount_gift_rate",
  "txn_cod_discount_nogift_enabled", "txn_cod_discount_nogift_rate",
  "txn_cod_nodiscount_gift_enabled", "txn_cod_nodiscount_gift_rate",
  "txn_cod_nodiscount_nogift_enabled", "txn_cod_nodiscount_nogift_rate",
];

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
  if (!opensAt || !closesAt) return NextResponse.json({ error: "請設定開放起訖時間" }, { status: 400 });
  if (new Date(opensAt) >= new Date(closesAt)) return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });

  const insertRow: Record<string, any> = {
    name,
    opens_at: opensAt,
    closes_at: closesAt,
    cod_campaign_cap: body.codCampaignCap ?? null,
    gift_base_unit: body.giftBaseUnit ?? 100,
    vendor_order_gift_cap: body.vendorOrderGiftCap ?? null,
  };
  for (const f of RATE_FIELDS) {
    if (body.rates && f in body.rates) insertRow[f] = body.rates[f];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("campaigns").insert(insertRow).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
