import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/vendor-gift-tiers
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
    .order("threshold_amount");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tiers: data });
}

// PUT /api/admin/campaigns/:id/vendor-gift-tiers — 整批覆蓋（門檻表通常一次改完全部）
// body: { tiers: [{ thresholdAmount, discountAmount }] }
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const tiers = body.tiers as { thresholdAmount: number; discountAmount: number }[];
  if (!Array.isArray(tiers)) return NextResponse.json({ error: "格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { error: deleteError } = await supabase.from("vendor_gift_tiers").delete().eq("campaign_id", params.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (tiers.length > 0) {
    const rows = tiers.map((t, i) => ({
      campaign_id: params.id,
      threshold_amount: t.thresholdAmount,
      discount_amount: t.discountAmount,
      sort_order: i,
    }));
    const { error: insertError } = await supabase.from("vendor_gift_tiers").insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
