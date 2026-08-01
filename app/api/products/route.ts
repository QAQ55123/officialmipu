import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/products?seriesId=xxx — 前台商品瀏覽（不需要登入、不需要檔期開放）
// 2.5節：檔期只決定「能不能買」，瀏覽本身跟檔期無關
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  const supabase = getSupabase();
  let query = supabase
    .from("products")
    .select("*, product_variants(*), series(id, name, is_gift_series)")
    .order("sort_order", { ascending: true });
  if (seriesId) query = query.eq("series_id", seriesId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}
