import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 3.2節：贈品缺口總覽，逐款式列出「顧客保底加總需要多少」vs「目前所有採購單已配置多少」。
 * 保底加總＝所有這個檔期訂單裡，顧客結帳當下實際選擇的滿贈數量加總（order_gift_selections），
 * 因為那就是系統已經向顧客承諾一定會拿到的數量。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: giftStyles, error: gsErr } = await supabase.from("gift_styles").select("id, style_name, threshold_amount").eq("campaign_id", params.id);
  if (gsErr) return NextResponse.json({ error: gsErr.message }, { status: 500 });

  const { data: orders } = await supabase.from("orders").select("id").eq("campaign_id", params.id);
  const orderIds = (orders || []).map((o) => o.id);

  const { data: selections } = orderIds.length
    ? await supabase.from("order_gift_selections").select("gift_style_id, qty").in("order_id", orderIds)
    : { data: [] };
  const promisedByStyle = new Map<string, number>();
  (selections || []).forEach((s: any) => {
    if (!s.gift_style_id) return;
    promisedByStyle.set(s.gift_style_id, (promisedByStyle.get(s.gift_style_id) || 0) + s.qty);
  });

  const { data: batches } = await supabase.from("vendor_purchase_batches").select("id").eq("campaign_id", params.id);
  const batchIds = (batches || []).map((b) => b.id);
  const { data: allocations } = batchIds.length
    ? await supabase.from("vendor_purchase_batch_gifts").select("gift_style_id, qty").in("batch_id", batchIds)
    : { data: [] };
  const allocatedByStyle = new Map<string, number>();
  (allocations || []).forEach((a: any) => {
    allocatedByStyle.set(a.gift_style_id, (allocatedByStyle.get(a.gift_style_id) || 0) + a.qty);
  });

  const { data: extraPurchases } = await supabase.from("vendor_extra_purchases").select("gift_style_id, qty").eq("campaign_id", params.id);
  const extraByStyle = new Map<string, number>();
  (extraPurchases || []).forEach((e: any) => {
    if (!e.gift_style_id) return;
    extraByStyle.set(e.gift_style_id, (extraByStyle.get(e.gift_style_id) || 0) + e.qty);
  });

  const overview = (giftStyles || []).map((s) => {
    const promised = promisedByStyle.get(s.id) || 0;
    const allocated = allocatedByStyle.get(s.id) || 0;
    const extra = extraByStyle.get(s.id) || 0;
    const diff = allocated + extra - promised; // 正=餘，負=缺
    return {
      giftStyleId: s.id,
      styleName: s.style_name,
      thresholdAmount: s.threshold_amount,
      promised,
      allocated,
      extra,
      diff,
    };
  });

  return NextResponse.json({ overview });
}
