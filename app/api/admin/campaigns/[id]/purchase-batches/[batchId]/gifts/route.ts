import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PUT body: { giftStyleId, qty } — 設定這張採購單對某個滿贈款式的配置數量（覆蓋式，qty=0代表移除）
 * 修正：三個條件都要真正擋住，不是只警告——
 *   ① 這張採購單的原幣小計沒有達到這個滿贈款式自己的門檻金額
 *   ② 超過平台對這個款式的每款上限
 *   ③ 超過平台單筆採購單的贈品總量上限
 * 沒有指定平台的採購單，無法配置任何滿贈（沒有平台就沒有規則可以比對，強制先選平台）。
 */
export async function PUT(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const giftStyleId = String(body.giftStyleId || "");
  const qty = Number(body.qty);
  if (!giftStyleId) return NextResponse.json({ error: "缺少滿贈款式" }, { status: 400 });
  if (!isFinite(qty) || qty < 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  if (qty === 0) {
    const { error } = await supabase.from("vendor_purchase_batch_gifts").delete().eq("batch_id", params.batchId).eq("gift_style_id", giftStyleId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: batch } = await supabase.from("vendor_purchase_batches").select("platform_id").eq("id", params.batchId).maybeSingle();
  if (!batch?.platform_id) return NextResponse.json({ error: "這張採購單還沒指定平台，請先選平台才能配置滿贈" }, { status: 400 });

  const { data: giftStyle } = await supabase.from("gift_styles").select("threshold_amount").eq("id", giftStyleId).maybeSingle();
  if (!giftStyle) return NextResponse.json({ error: "找不到這個滿贈款式" }, { status: 404 });

  // 這張採購單的原幣小計
  const { data: batchItems } = await supabase
    .from("vendor_purchase_batch_items")
    .select("qty, order_items(unit_price_original)")
    .eq("batch_id", params.batchId);
  const subtotalOriginal = (batchItems || []).reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0);
  if (subtotalOriginal < Number(giftStyle.threshold_amount)) {
    return NextResponse.json(
      { error: `這張採購單的原幣小計 ￥${subtotalOriginal} 還沒達到這個款式的門檻 ￥${giftStyle.threshold_amount}，不能配置` },
      { status: 400 }
    );
  }

  const { data: platform } = await supabase.from("vendor_platforms").select("order_gift_cap").eq("id", batch.platform_id).maybeSingle();
  const { data: styleCap } = await supabase.from("vendor_platform_style_caps").select("per_style_cap").eq("platform_id", batch.platform_id).eq("gift_style_id", giftStyleId).maybeSingle();
  const { data: allGifts } = await supabase.from("vendor_purchase_batch_gifts").select("gift_style_id, qty").eq("batch_id", params.batchId);
  const totalQtyExcludingThis = (allGifts || []).filter((g) => g.gift_style_id !== giftStyleId).reduce((s, g) => s + g.qty, 0);

  if (styleCap && qty > styleCap.per_style_cap) {
    return NextResponse.json({ error: `已超過這個平台對此款式的每款上限（${styleCap.per_style_cap}）` }, { status: 400 });
  }
  if (platform && totalQtyExcludingThis + qty > platform.order_gift_cap) {
    return NextResponse.json({ error: `這張採購單的贈品總量會變成 ${totalQtyExcludingThis + qty}，已超過平台單筆總量上限（${platform.order_gift_cap}）` }, { status: 400 });
  }

  const { error } = await supabase
    .from("vendor_purchase_batch_gifts")
    .upsert({ batch_id: params.batchId, gift_style_id: giftStyleId, qty }, { onConflict: "batch_id,gift_style_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
