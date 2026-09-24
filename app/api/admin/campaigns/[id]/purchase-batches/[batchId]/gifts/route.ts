import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { getBatchGiftContext, styleMaxFor } from "@/lib/batchGiftCaps";

/**
 * PUT body: { giftStyleId, qty } — 設定這張採購單對某個滿贈款式的配置數量（覆蓋式，qty=0代表移除）
 * 3.2節：每個款式各自的上限，取「依該款式門檻金額算出的上限（floor(採購單金額÷門檻)，沿用2.7的公式）」
 * 與「所選平台在該門檻等級的每款上限」兩者中較小值，不是單純判斷有沒有達到門檻就放行。
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

  const ctx = await getBatchGiftContext(supabase, params.id, params.batchId);
  if (!ctx.platformId) return NextResponse.json({ error: "這張採購單還沒指定平台，請先選平台才能配置滿贈" }, { status: 400 });

  const { data: giftStyle } = await supabase.from("gift_styles").select("threshold_amount").eq("id", giftStyleId).maybeSingle();
  if (!giftStyle) return NextResponse.json({ error: "找不到這個滿贈款式" }, { status: 404 });

  const threshold = Number(giftStyle.threshold_amount) || 0;
  if (threshold > 0 && ctx.subtotalOriginal < threshold) {
    return NextResponse.json(
      { error: `這張採購單的原幣小計 ￥${ctx.subtotalOriginal} 還沒達到這個款式的門檻 ￥${threshold}，不能配置` },
      { status: 400 }
    );
  }

  // 每款上限
  const styleMax = styleMaxFor(ctx, giftStyleId, threshold);
  if (qty > styleMax) {
    return NextResponse.json({ error: `這個款式最多只能配置 ${styleMax} 個` }, { status: 400 });
  }

  // 總量上限＝min(採購單金額換算的數量, 平台單筆上限)。
  // 原本只看平台上限，金額不夠的採購單也能手動配滿（例：359元只能拿3個卻能加到5個）
  const { data: allGifts } = await supabase.from("vendor_purchase_batch_gifts").select("gift_style_id, qty").eq("batch_id", params.batchId);
  const totalQtyExcludingThis = (allGifts || []).filter((g: any) => g.gift_style_id !== giftStyleId).reduce((s: number, g: any) => s + g.qty, 0);
  if (totalQtyExcludingThis + qty > ctx.totalCap) {
    return NextResponse.json(
      { error: `這張採購單的滿贈總量最多 ${ctx.totalCap} 個，已配置其他款式 ${totalQtyExcludingThis} 個，這個款式最多還能配 ${Math.max(0, ctx.totalCap - totalQtyExcludingThis)} 個` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("vendor_purchase_batch_gifts")
    .upsert({ batch_id: params.batchId, gift_style_id: giftStyleId, qty }, { onConflict: "batch_id,gift_style_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
