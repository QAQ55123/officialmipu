import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });
  return NextResponse.json({ campaign: data });
}

const ALLOWED_FIELDS = [
  "name", "opens_at", "closes_at", "cod_campaign_cap", "gift_cod_campaign_cap", "checkout_gift_platform_id", "gift_base_unit", "vendor_order_gift_cap",
  "txn_bank_discount_gift_enabled", "txn_bank_discount_gift_rate",
  "txn_bank_discount_nogift_enabled", "txn_bank_discount_nogift_rate",
  "txn_bank_nodiscount_gift_enabled", "txn_bank_nodiscount_gift_rate",
  "txn_bank_nodiscount_nogift_enabled", "txn_bank_nodiscount_nogift_rate",
  "txn_cod_discount_gift_enabled", "txn_cod_discount_gift_rate",
  "txn_cod_discount_nogift_enabled", "txn_cod_discount_nogift_rate",
  "txn_cod_nodiscount_gift_enabled", "txn_cod_nodiscount_gift_rate",
  "txn_cod_nodiscount_nogift_enabled", "txn_cod_nodiscount_nogift_rate",
];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  for (const f of ALLOWED_FIELDS) if (f in body) updates[f] = body[f];

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("campaigns").update(updates).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("campaigns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
