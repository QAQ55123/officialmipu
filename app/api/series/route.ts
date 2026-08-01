import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/series — 前台系列列表（不需要登入）
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("series").select("id, name, is_gift_series").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}
