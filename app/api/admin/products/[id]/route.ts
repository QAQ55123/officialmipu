import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";
import { deleteStorageFiles } from "@/lib/storage";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("name" in body) updates.name = String(body.name).trim();
  if ("amount" in body) updates.amount = Number(body.amount);
  if ("shippingFee" in body) updates.shipping_fee = Number(body.shippingFee);
  if ("hasDiscountFlag" in body) updates.has_discount_flag = !!body.hasDiscountFlag;
  if ("codAllowed" in body) updates.cod_allowed = !!body.codAllowed;
  if ("seriesId" in body) updates.series_id = body.seriesId;
  if ("imageUrl" in body) updates.image_url = body.imageUrl ? toDirectImageUrl(String(body.imageUrl)) : null;

  const supabase = getSupabaseAdmin();

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("products").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body.styles)) {
    await supabase.from("product_variants").delete().eq("product_id", params.id);
    const styles: string[] = body.styles.filter(Boolean);
    const rows: { product_id: string; style_name: string | null }[] =
      styles.length > 0
        ? styles.map((s: string) => ({ product_id: params.id, style_name: s }))
        : [{ product_id: params.id, style_name: null }];
    const { error: vErr } = await supabase.from("product_variants").insert(rows);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  const { data, error } = await supabase.from("products").select("*, product_variants(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data: product } = await supabase.from("products").select("image_url").eq("id", params.id).single();

  const { error } = await supabase.from("products").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (product?.image_url) deleteStorageFiles([product.image_url]).catch(() => {});
  return NextResponse.json({ ok: true });
}
