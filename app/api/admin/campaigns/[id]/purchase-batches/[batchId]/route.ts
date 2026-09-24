import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { clampBatchGifts } from "@/lib/batchGiftCaps";

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

  // 換平台之後，用共用規則把既有滿贈夾回新平台的上限內
  // （總量上限＝min(金額換算數量, 平台上限)，原本這裡只看平台上限）
  const adjustedGifts: string[] = "platformId" in body ? await clampBatchGifts(supabase, params.id, params.batchId) : [];

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
