import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PATCH：換平台（換了之後總上限/每款上限/對應折扣都以新平台重新計算，前端重新拉一次資料即可反映）
 * 3.2節：換平台後，「所有規則」都要以新平台重新計算——這裡額外處理：既有的滿贈配置如果超過
 * 新平台的規則（每款上限、總量上限），要自動降到新的上限，不能讓舊資料繼續違反新平台的規則。
 * 3.2節：額外調整支援連續輸入多筆數字（如 "-20 -30"），系統自動抓出所有數字加總。
 */
export async function PATCH(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("platformId" in body) updates.platform_id = body.platformId || null;
  if ("label" in body) updates.label = body.label || null;
  if ("extraAdjustmentText" in body) {
    const text = String(body.extraAdjustmentText || "");
    const matches = text.match(/-?\d+(\.\d+)?/g) || [];
    const sum = matches.reduce((s, n) => s + Number(n), 0);
    updates.extra_adjustment_text = text;
    updates.extra_adjustment = sum;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_purchase_batches").update(updates).eq("id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adjustedGifts: string[] = [];
  if ("platformId" in body) {
    const newPlatformId = body.platformId || null;

    const { data: existingGifts } = await supabase
      .from("vendor_purchase_batch_gifts")
      .select("id, gift_style_id, qty, gift_styles(style_name, threshold_amount)")
      .eq("batch_id", params.batchId);

    if (existingGifts && existingGifts.length > 0) {
      const { data: batchItems } = await supabase
        .from("vendor_purchase_batch_items")
        .select("qty, order_items(unit_price_original)")
        .eq("batch_id", params.batchId);
      const subtotalOriginal = (batchItems || []).reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0);

      if (!newPlatformId) {
        // 沒有平台了，滿贈規則完全無從比對，全部清空
        await supabase.from("vendor_purchase_batch_gifts").delete().eq("batch_id", params.batchId);
        existingGifts.forEach((g: any) => adjustedGifts.push(`${g.gift_styles?.style_name}：因為取消指定平台，配置已清空`));
      } else {
        const { data: platform } = await supabase.from("vendor_platforms").select("order_gift_cap").eq("id", newPlatformId).maybeSingle();
        let runningTotal = 0;
        for (const g of existingGifts as any[]) {
          const threshold = Number(g.gift_styles?.threshold_amount) || 0;
          const amountBasedMax = threshold > 0 ? Math.floor(subtotalOriginal / threshold) : 0;
          const { data: styleCap } = await supabase
            .from("vendor_platform_style_caps")
            .select("per_style_cap")
            .eq("platform_id", newPlatformId)
            .eq("gift_style_id", g.gift_style_id)
            .maybeSingle();
          let newMax = styleCap ? Math.min(amountBasedMax, styleCap.per_style_cap) : amountBasedMax;
          if (platform) newMax = Math.min(newMax, Math.max(0, platform.order_gift_cap - runningTotal));
          if (newMax < g.qty) {
            if (newMax <= 0) {
              await supabase.from("vendor_purchase_batch_gifts").delete().eq("id", g.id);
            } else {
              await supabase.from("vendor_purchase_batch_gifts").update({ qty: newMax }).eq("id", g.id);
            }
            adjustedGifts.push(`${g.gift_styles?.style_name}：${g.qty} → ${newMax}`);
          }
          runningTotal += Math.min(newMax, g.qty);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, adjustedGifts: adjustedGifts.length > 0 ? adjustedGifts : undefined });
}

/** DELETE：刪除這張採購單，裡面的品項會自動回到「未分配品項池」（因為分配紀錄一起被刪掉了） */
export async function DELETE(req: Request, { params }: { params: { id: string; batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_purchase_batches").delete().eq("id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
