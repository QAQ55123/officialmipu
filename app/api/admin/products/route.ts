import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { deleteStorageFiles } from "@/lib/storage";
import { syncProductsSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;


/** 後台用：列出某個企劃底下的所有商品 ?pw=&seriesId= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const seriesId = searchParams.get("seriesId");

  const supabase = getSupabaseAdmin();
  let query = supabase.from("products").select("*").order("sort_order", { ascending: true });
  if (seriesId) query = query.eq("series_id", seriesId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    products: (data || []).map((p) => ({
      id: p.id,
      seriesId: p.series_id,
      name: p.name,
      style: p.style,
      price: Number(p.price),
      imageUrl: p.image_url,
      codAllowed: p.cod_allowed,
      shippingFee: Number(p.shipping_fee) || 0,
      linkedGiftStyleId: p.linked_gift_style_id || null,
      hasDiscountFlag: p.has_discount_flag,
      coverImageUrl: p.cover_image_url || null,
      altSiteBankPrice: p.alt_site_bank_price != null ? Number(p.alt_site_bank_price) : null,
      altSiteCodPrice: p.alt_site_cod_price != null ? Number(p.alt_site_cod_price) : null,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.seriesId) return NextResponse.json({ error: "缺少系列" }, { status: 400 });
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請填寫商品名稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("products")
    .select("sort_order")
    .eq("series_id", body.seriesId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("products")
    .insert({
      series_id: body.seriesId,
      name,
      style: body.style || "",
      price: Number(body.price) || 0,
      image_url: body.imageUrl || null,
      cod_allowed: body.codAllowed === false ? false : true,
      shipping_fee: Number(body.shippingFee) || 0,
      has_discount_flag: !!body.hasDiscountFlag,
      cover_image_url: body.coverImageUrl || null,
      alt_site_bank_price: body.altSiteBankPrice !== undefined && body.altSiteBankPrice !== "" && body.altSiteBankPrice !== null ? Number(body.altSiteBankPrice) : null,
      alt_site_cod_price: body.altSiteCodPrice !== undefined && body.altSiteCodPrice !== "" && body.altSiteCodPrice !== null ? Number(body.altSiteCodPrice) : null,
      sort_order: nextSortOrder,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 封面圖是「商品名稱」層級共用的，這個名稱底下如果已經有其他款式列，也要一併同步封面圖
  if (body.coverImageUrl !== undefined) {
    await supabase.from("products").update({ cover_image_url: body.coverImageUrl || null }).eq("series_id", body.seriesId).eq("name", name);
  }

  syncProductsSheet().catch(() => {});
  return NextResponse.json({ ok: true, product: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少商品 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: oldProduct } = await supabase.from("products").select("image_url, series_id, name").eq("id", body.id).single();

  const { error } = await supabase
    .from("products")
    .update({
      name: body.name,
      style: body.style || "",
      price: Number(body.price) || 0,
      image_url: body.imageUrl || null,
      cod_allowed: body.codAllowed === false ? false : true,
      shipping_fee: Number(body.shippingFee) || 0,
      has_discount_flag: !!body.hasDiscountFlag,
      cover_image_url: body.coverImageUrl || null,
      alt_site_bank_price: body.altSiteBankPrice !== undefined && body.altSiteBankPrice !== "" && body.altSiteBankPrice !== null ? Number(body.altSiteBankPrice) : null,
      alt_site_cod_price: body.altSiteCodPrice !== undefined && body.altSiteCodPrice !== "" && body.altSiteCodPrice !== null ? Number(body.altSiteCodPrice) : null,
    })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 封面圖是「商品名稱」層級共用的，同名的其他款式列也要一起同步
  if (body.coverImageUrl !== undefined && oldProduct) {
    await supabase.from("products").update({ cover_image_url: body.coverImageUrl || null }).eq("series_id", oldProduct.series_id).eq("name", body.name || oldProduct.name);
  }

  const newImageUrl = body.imageUrl || null;
  if (oldProduct?.image_url && oldProduct.image_url !== newImageUrl) {
    deleteStorageFiles([oldProduct.image_url]).catch(() => {});
  }

  syncProductsSheet().catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (!body.id) return NextResponse.json({ error: "缺少商品 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: product } = await supabase.from("products").select("image_url").eq("id", body.id).single();

  const { error } = await supabase.from("products").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (product?.image_url) deleteStorageFiles([product.image_url]).catch(() => {});

  syncProductsSheet().catch(() => {});
  return NextResponse.json({ ok: true });
}
