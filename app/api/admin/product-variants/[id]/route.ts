import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("styleName" in body) updates.style_name = body.styleName || null;
  if ("amount" in body) updates.amount = Number(body.amount);
  if ("shippingFee" in body) updates.shipping_fee = Number(body.shippingFee);
  if ("hasDiscountFlag" in body) updates.has_discount_flag = !!body.hasDiscountFlag;
  if ("codAllowed" in body) updates.cod_allowed = !!body.codAllowed;
  if ("imageUrl" in body) updates.image_url = body.imageUrl ? toDirectImageUrl(String(body.imageUrl)) : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("product_variants").update(updates).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variant: data });
}

// DELETE /api/admin/product-variants/:id — 刪除單一款式（如果是該商品最後一個款式，連同商品一起刪除）
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: variant } = await supabase.from("product_variants").select("product_id").eq("id", params.id).maybeSingle();
  const { error } = await supabase.from("product_variants").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (variant?.product_id) {
    const { count } = await supabase.from("product_variants").select("id", { count: "exact", head: true }).eq("product_id", variant.product_id);
    if (!count || count === 0) {
      await supabase.from("products").delete().eq("id", variant.product_id);
    }
  }
  return NextResponse.json({ ok: true });
}
