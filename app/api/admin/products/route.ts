import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/products?seriesId=xxx — 獨立商品庫列表（含款式，每個款式各自的金額/圖片/運費/取付設定）
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

/**
 * POST /api/admin/products — 新增商品（比照 mibu-app 原本模式：款式各自獨立金額/圖片/運費/取付）
 * body:
 *   { productId, variant: {...} }  → 幫既有商品(productId)新增一筆款式
 *   { seriesId, name, variants: [{...}] }  → 新建商品，同時建立一或多筆款式
 * variant 欄位: { styleName, amount, shippingFee, hasDiscountFlag, codAllowed, imageUrl }
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const supabase = getSupabaseAdmin();

  function buildVariantRow(productId: string, v: any) {
    const amount = Number(v.amount);
    if (!isFinite(amount) || amount < 0) throw new Error("金額格式不正確");
    return {
      product_id: productId,
      style_name: v.styleName || null,
      amount,
      shipping_fee: Number(v.shippingFee) || 0,
      has_discount_flag: !!v.hasDiscountFlag,
      cod_allowed: v.codAllowed === false ? false : true,
      image_url: v.imageUrl ? toDirectImageUrl(String(v.imageUrl)) : null,
    };
  }

  try {
    // 幫既有商品新增一筆款式
    if (body.productId) {
      const row = buildVariantRow(body.productId, body.variant || {});
      const { data, error } = await supabase.from("product_variants").insert(row).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ variant: data });
    }

    // 新建商品
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "請輸入商品名稱" }, { status: 400 });

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({ series_id: body.seriesId ?? null, name })
      .select()
      .single();
    if (productError) throw new Error(productError.message);

    const variants: any[] = Array.isArray(body.variants) && body.variants.length > 0 ? body.variants : [{}];
    const rows = variants.map((v) => buildVariantRow(product.id, v));
    const { data: createdVariants, error: variantError } = await supabase.from("product_variants").insert(rows).select();
    if (variantError) throw new Error(variantError.message);

    return NextResponse.json({ product: { ...product, product_variants: createdVariants } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
