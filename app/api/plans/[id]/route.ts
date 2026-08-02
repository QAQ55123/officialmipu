import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();

  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("*, categories(id, name, parent_id)")
    .eq("id", params.id)
    .single();
  if (planErr || !plan) return NextResponse.json({ error: "找不到企劃" }, { status: 404 });

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, style, price, image_url, has_discount_flag, cod_allowed")
    .eq("plan_id", params.id)
    .order("sort_order", { ascending: true });
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const closed = plan.deadline ? new Date(plan.deadline).getTime() < Date.now() : false;

  return NextResponse.json(
    {
      plan: {
        id: plan.id,
        name: plan.name,
        imageUrl: plan.image_url,
        allowCodOnRemitLink: !!plan.allow_cod_on_remit_link,
        deadline: plan.deadline,
        closed,
        categoryId: plan.category_id,
        categoryName: plan.categories?.name || null,
        categoryParentId: plan.categories?.parent_id || null,
        promoImages: plan.promo_images || [],
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
