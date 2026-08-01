import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/products?seriesId=xxx — 獨立商品庫列表（含款式）
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  const supabase = getSupabaseAdmin();
  let query = supabase.from("products").select("*, product_variants(*)").order("sort_order", { ascending: true });
  if (seriesId) query = query.eq("series_id", seriesId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

// POST /api/admin/products — 手動新增商品（2.2節：CSV匯入只是捷徑，不是唯一新增方式）
// body: { seriesId, name, amount, shippingFee, hasDiscountFlag, imageUrl, styles: string[] }
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  const amount = Number(body.amount);

  if (!name) return NextResponse.json({ error: "請輸入商品名稱" }, { status: 400 });
  if (!isFinite(amount) || amount < 0) return NextResponse.json({ error: "商品金額格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      series_id: body.seriesId ?? null,
      name,
      amount,
      shipping_fee: Number(body.shippingFee) || 0,
      has_discount_flag: !!body.hasDiscountFlag,
      cod_allowed: body.codAllowed === false ? false : true,
      image_url: body.imageUrl ? toDirectImageUrl(String(body.imageUrl)) : null,
    })
    .select()
    .single();
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });

  // 款式用逗號分隔，留空 = 單一款式（2.2節）
  const styles: string[] = Array.isArray(body.styles) ? body.styles.filter(Boolean) : [];
  const variantRows: { product_id: string; style_name: string | null }[] =
    styles.length > 0
      ? styles.map((s) => ({ product_id: product.id, style_name: s }))
      : [{ product_id: product.id, style_name: null }];

  const { data: variants, error: variantError } = await supabase.from("product_variants").insert(variantRows).select();
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 });

  return NextResponse.json({ product: { ...product, product_variants: variants } });
}
