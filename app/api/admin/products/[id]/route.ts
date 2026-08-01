import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";

// PATCH /api/admin/products/:id — 修改商品本身（名稱／系列／封面圖，不含款式細節）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("name" in body) updates.name = String(body.name).trim();
  if ("seriesId" in body) updates.series_id = body.seriesId;
  if ("imageUrl" in body) updates.image_url = body.imageUrl ? toDirectImageUrl(String(body.imageUrl)) : null;

  const supabase = getSupabaseAdmin();
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("products").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data, error } = await supabase.from("products").select("*, product_variants(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

// DELETE /api/admin/products/:id — 刪除整個商品（含所有款式）
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("products").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
