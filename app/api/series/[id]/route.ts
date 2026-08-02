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

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, style, price, image_url, has_discount_flag, cod_allowed")
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
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
