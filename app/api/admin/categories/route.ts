import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請填寫分類名稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  let siblingQuery = supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  siblingQuery = body.parentId ? siblingQuery.eq("parent_id", body.parentId) : siblingQuery.is("parent_id", null);
  const { data: existing } = await siblingQuery;
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("categories")
    .insert({ name, parent_id: body.parentId || null, sort_order: nextSortOrder })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, category: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少分類 id" }, { status: 400 });
  if (body.parentId === body.id) {
    return NextResponse.json({ error: "父分類不能是自己" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("categories")
    .update({ name: body.name, parent_id: body.parentId || null })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少分類 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // 刪除分類：子分類會因為外鍵 cascade 一起被刪除，底下企劃的 category_id 會自動變成 null（不會刪企劃本身）
  const { error } = await supabase.from("categories").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
