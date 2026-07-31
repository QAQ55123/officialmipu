import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/products — 這個檔期目前挑了哪些商品
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campaign_products")
    .select("product_id, products(*, product_variants(*))")
    .eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: (data || []).map((row: any) => row.products).filter(Boolean) });
}

// POST /api/admin/campaigns/:id/products — 從商品庫挑一個既有商品進來這個檔期 body: { productId }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const productId = String(body.productId || "");
  if (!productId) return NextResponse.json({ error: "請選擇商品" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("campaign_products").insert({ campaign_id: params.id, product_id: productId });
  if (error) {
    if (error.message.includes("duplicate")) return NextResponse.json({ error: "這個商品已經在這個檔期裡了" }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/campaigns/:id/products — 把商品從這個檔期移除（不會刪除商品本身，只是不在這檔期賣了）
// body: { productId }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const productId = String(body.productId || "");
  if (!productId) return NextResponse.json({ error: "請選擇商品" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("campaign_products").delete().eq("campaign_id", params.id).eq("product_id", productId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
