import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("name" in body) updates.name = String(body.name).trim();
  if ("sortOrder" in body) updates.sort_order = body.sortOrder;
  // is_gift_series 刻意不允許事後修改：要換哪個系列是特殊贈品系列，
  // 應該用「刪掉重建」而不是隨意切換，避免誤觸

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("series")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("series_id", params.id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `這個系列底下還有 ${count} 個商品，請先移除或改到別的系列` },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("series").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
