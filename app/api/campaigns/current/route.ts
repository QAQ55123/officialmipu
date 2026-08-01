import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/campaigns/current — 目前是否有開放中的檔期（2.5節：檔期只控制能不能買）
// 若同時有多個檔期開放（理論上不常見），取最近開始的那個
export async function GET() {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, name, opens_at, closes_at, gift_base_unit, vendor_order_gift_cap, cod_campaign_cap, cod_campaign_used, " +
        "txn_bank_discount_gift_enabled, txn_bank_discount_gift_rate, " +
        "txn_bank_discount_nogift_enabled, txn_bank_discount_nogift_rate, " +
        "txn_bank_nodiscount_gift_enabled, txn_bank_nodiscount_gift_rate, " +
        "txn_bank_nodiscount_nogift_enabled, txn_bank_nodiscount_nogift_rate, " +
        "txn_cod_discount_gift_enabled, txn_cod_discount_gift_rate, " +
        "txn_cod_discount_nogift_enabled, txn_cod_discount_nogift_rate, " +
        "txn_cod_nodiscount_gift_enabled, txn_cod_nodiscount_gift_rate, " +
        "txn_cod_nodiscount_nogift_enabled, txn_cod_nodiscount_nogift_rate"
    )
    .lte("opens_at", now)
    .gte("closes_at", now)
    .order("opens_at", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const campaign = data?.[0] ?? null;
  return NextResponse.json({ campaign, isOpen: !!campaign });
}
