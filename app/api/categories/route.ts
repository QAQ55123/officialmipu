import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/categories — 前台分類列表（不需要登入）
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("categories").select("id, name").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}
