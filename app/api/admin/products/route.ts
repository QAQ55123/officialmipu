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
      hasDiscountFlag: p.has_discount_flag,
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
      sort_order: nextSortOrder,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  const { data: oldProduct } = await supabase.from("products").select("image_url").eq("id", body.id).single();

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
    })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
