import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("*, categories(id, name, parent_id)")
    .eq("id", params.id)
    .single();
  if (seriesErr || !series) return NextResponse.json({ error: "找不到系列" }, { status: 404 });
  // 系列被隱藏＝視同缺貨不能下單，購物車裡這個系列的商品要判定為失效（比照系列被刪除時的處理方式）
  if (series.is_visible === false) return NextResponse.json({ error: "此系列目前未開放瀏覽" }, { status: 404 });

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, style, price, image_url, has_discount_flag, cod_allowed, linked_gift_style_id")
    .eq("series_id", params.id)
    .order("sort_order", { ascending: true });
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  return NextResponse.json(
    {
      plan: {
        id: series.id,
        name: series.name,
        imageUrl: series.image_url,
        categoryId: series.category_id,
        categoryName: series.categories?.name || null,
        categoryParentId: series.categories?.parent_id || null,
        promoImages: series.promo_images || [],
      },
      products: (products || []).map((p) => ({
        id: p.id,
        name: p.name,
        style: p.style || "",
        price: Number(p.price),
        imageUrl: p.image_url,
        hasDiscountFlag: !!p.has_discount_flag,
        codAllowed: p.cod_allowed !== false,
        linkedGiftStyleId: p.linked_gift_style_id || null,
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
