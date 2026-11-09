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
    .select("id, name, image_url, visible_to, sort_order, created_at, category_id, categories!series_category_id_fkey(id, name, parent_id)")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  // 分類篩選：選到上層分類時，要包含它底下所有子分類的系列
  if (categoryId) {
    // 分類有三層：點第一層要連第二層、第三層底下的系列都撈出來
    const { data: allCats } = await supabase.from("categories").select("id, parent_id");
    const ids = [categoryId];
    let frontier = [categoryId];
    while (frontier.length > 0) {
      const next: string[] = [];
      (allCats || []).forEach((c) => {
        if (c.parent_id && frontier.includes(c.parent_id) && !ids.includes(c.id)) {
          ids.push(c.id);
          next.push(c.id);
        }
      });
      frontier = next;
    }
    // 系列可以掛在多個分類底下，所以要從關聯表反查有哪些系列屬於這些分類
    const { data: links } = await supabase.from("series_categories").select("series_id").in("category_id", ids);
    const seriesIds = Array.from(new Set((links || []).map((l: any) => l.series_id)));
    if (seriesIds.length === 0) return NextResponse.json({ plans: [] });
    query = query.in("id", seriesIds);
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
        .select("id, name, image_url, visible_to, sort_order, created_at, category_id, categories!series_category_id_fkey(id, name, parent_id)")
        .eq("is_visible", true)
        .in("id", missingIds);
      rows = rows.concat(extra || []);
    }
  }

  // 排序：先依「主分類」分組（主分類的先後＝前台側邊欄的分類順序），同一組內照後台系列管理拖曳的順序。
  // 系列可以掛在多個分類底下（例如同時在「徽章」和「新品上市」），在「新品上市」裡看時，
  // 主分類是徽章的系列會排在一起，不會跟其他主分類的系列交錯。
  const { data: catRows } = await supabase.from("categories").select("id, name, parent_id, sort_order");
  const cats = catRows || [];
  const byCatOrder = (a: any, b: any) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));
  const catRank = new Map<string, number>();
  const walk = (parentId: string | null) => {
    cats
      .filter((c: any) => (c.parent_id || null) === parentId)
      .sort(byCatOrder)
      .forEach((c: any) => {
        catRank.set(c.id, catRank.size);
        walk(c.id);
      });
  };
  walk(null);
  const rankOf = (catId: string | null) => (catId && catRank.has(catId) ? catRank.get(catId)! : Number.MAX_SAFE_INTEGER);
  rows = [...rows].sort((a: any, b: any) => {
    const byCat = rankOf(a.category_id) - rankOf(b.category_id);
    if (byCat !== 0) return byCat;
    const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (bySort !== 0) return bySort;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

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
