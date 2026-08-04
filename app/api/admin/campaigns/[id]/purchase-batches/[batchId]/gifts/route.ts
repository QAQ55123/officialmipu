import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PUT body: { giftStyleId, qty } — 設定這張採購單對某個滿贈款式的配置數量（覆蓋式，qty=0代表移除）
 * 系統只提示超額，不阻擋（3.2節：贈品缺口總覽單純顯示，不自動限制店家操作），
 * 但會回傳目前的上限資訊給前端顯示警示。
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

  const { error } = await supabase
    .from("vendor_purchase_batch_gifts")
    .upsert({ batch_id: params.batchId, gift_style_id: giftStyleId, qty }, { onConflict: "batch_id,gift_style_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 算這張採購單目前的總配置量+這個款式的上限，回傳給前端判斷要不要顯示警示
  const { data: batch } = await supabase.from("vendor_purchase_batches").select("platform_id").eq("id", params.batchId).maybeSingle();
  let warning = "";
  if (batch?.platform_id) {
    const { data: platform } = await supabase.from("vendor_platforms").select("order_gift_cap").eq("id", batch.platform_id).maybeSingle();
    const { data: styleCap } = await supabase.from("vendor_platform_style_caps").select("per_style_cap").eq("platform_id", batch.platform_id).eq("gift_style_id", giftStyleId).maybeSingle();
    const { data: allGifts } = await supabase.from("vendor_purchase_batch_gifts").select("qty").eq("batch_id", params.batchId);
    const totalQty = (allGifts || []).reduce((s, g) => s + g.qty, 0);

    if (styleCap && qty > styleCap.per_style_cap) {
      warning = `已超過這個平台對此款式的每款上限（${styleCap.per_style_cap}）`;
    } else if (platform && totalQty > platform.order_gift_cap) {
      warning = `這張採購單的贈品總量（${totalQty}）已超過平台單筆總量上限（${platform.order_gift_cap}）`;
    }
  }

  return NextResponse.json({ ok: true, warning: warning || undefined });
}
