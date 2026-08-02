import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const q = (searchParams.get("q") || "").trim();

  let query = supabase
    .from("series")
    .select("id, name, image_url, visible_to, sort_order, category_id, categories(id, name, parent_id)")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  // 分類篩選：選到上層分類時，要包含它底下所有子分類的系列
  if (categoryId) {
    const { data: allCats } = await supabase.from("categories").select("id, parent_id");
    const ids = [categoryId];
    (allCats || []).forEach((c) => {
      if (c.parent_id === categoryId) ids.push(c.id);
    });
    query = query.in("category_id", ids);
  }

  // 搜尋：系列名稱符合，或底下有商品名稱符合
  let matchSeriesIdsFromProducts: string[] | null = null;
  if (q) {
    const { data: matchedProducts } = await supabase
      .from("products")
      .select("series_id")
      .ilike("name", `%${q}%`);
    matchSeriesIdsFromProducts = [...new Set((matchedProducts || []).map((p) => p.series_id))];
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data || [];

  // 如果有搜尋，額外把「商品名稱符合、但系列名稱不符合」的系列也撈回來
  if (q && matchSeriesIdsFromProducts && matchSeriesIdsFromProducts.length > 0) {
    const existingIds = new Set(rows.map((r) => r.id));
    const missingIds = matchSeriesIdsFromProducts.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      const { data: extra } = await supabase
        .from("series")
        .select("id, name, image_url, visible_to, sort_order, category_id, categories(id, name, parent_id)")
        .eq("is_visible", true)
        .in("id", missingIds);
      rows = rows.concat(extra || []);
    }
  }

  const plans = rows.map((p: any) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.image_url,
    categoryId: p.category_id,
    categoryName: p.categories?.name || null,
    categoryParentId: p.categories?.parent_id || null,
  }));

  return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
