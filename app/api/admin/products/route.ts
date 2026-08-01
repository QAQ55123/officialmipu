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
 * POST /api/admin/products — 新增商品（比照 mibu-app 原本saveProduct的行為）
 * body: { name, seriesId, imageUrl(封面圖，選填), rows: [{ style, price, imageUrl, shippingFee, hasDiscountFlag, codAllowed }] }
 *
 * 名稱如果跟既有商品完全相同，就直接把這些款式加到那個既有商品底下（不會重複建立同名商品）；
 * 沒有相同名稱的話才新建一個商品。這就是「快速選擇」點了既有名稱之後、存檔會自動歸到同一個商品的原理。
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請填寫商品名稱" }, { status: 400 });

  const rows: any[] = Array.isArray(body.rows) && body.rows.length > 0 ? body.rows : [{}];
  for (const r of rows) {
    const amount = Number(r.price);
    if (!isFinite(amount) || amount < 0) return NextResponse.json({ error: "價格格式不正確" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    // 找找看有沒有同名的既有商品
    let productId: string;
    const { data: existing } = await supabase.from("products").select("id").eq("name", name).maybeSingle();

    if (existing) {
      productId = existing.id;
      // 如果這次有帶系列/封面圖，一併更新
      const updates: Record<string, any> = {};
      if (body.seriesId !== undefined) updates.series_id = body.seriesId || null;
      if (body.imageUrl) updates.image_url = toDirectImageUrl(String(body.imageUrl));
      if (Object.keys(updates).length > 0) await supabase.from("products").update(updates).eq("id", productId);
    } else {
      const { data: created, error: createError } = await supabase
        .from("products")
        .insert({ series_id: body.seriesId || null, name, image_url: body.imageUrl ? toDirectImageUrl(String(body.imageUrl)) : null })
        .select()
        .single();
      if (createError) throw new Error(createError.message);
      productId = created.id;
    }

    const variantRows = rows.map((r) => ({
      product_id: productId,
      style_name: r.style || null,
      amount: Number(r.price) || 0,
      shipping_fee: Number(r.shippingFee) || 0,
      has_discount_flag: !!r.hasDiscountFlag,
      cod_allowed: r.codAllowed === false ? false : true,
      image_url: r.imageUrl ? toDirectImageUrl(String(r.imageUrl)) : null,
    }));

    const { error: variantError } = await supabase.from("product_variants").insert(variantRows);
    if (variantError) {
      // 如果是這次才新建的商品、款式又建立失敗，商品要一起撤銷，不留孤兒商品
      if (!existing) await supabase.from("products").delete().eq("id", productId);
      throw new Error(variantError.message);
    }

    return NextResponse.json({ ok: true, createdCount: variantRows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
