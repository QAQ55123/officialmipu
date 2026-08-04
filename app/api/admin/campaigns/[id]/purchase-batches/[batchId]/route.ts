import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** PATCH：換平台（換了之後總上限/每款上限/對應折扣都以新平台重新計算，前端重新拉一次資料即可反映） */
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
  if ("extraAdjustment" in body) updates.extra_adjustment = Number(body.extraAdjustment) || 0;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_purchase_batches").update(updates).eq("id", params.batchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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
