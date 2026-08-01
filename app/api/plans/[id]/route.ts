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
    .select("id, name, style, price, image_url")
    .eq("plan_id", params.id)
    .order("sort_order", { ascending: true });
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const closed = plan.deadline ? new Date(plan.deadline).getTime() < Date.now() : false;

  // 取付上限是「這個顧客在這個企劃的累計金額」，不是單筆訂單；有帶 username 的話，
  // 順便算出他之前已經取付過的金額，結帳頁面才能正確判斷還可以取付多少
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get("username") || "").trim();
  let priorCodTotal = 0;
  if (username) {
    const { data: priorOrders } = await supabase
      .from("orders")
      .select("order_items(subtotal)")
      .eq("plan_id", params.id)
      .ilike("username", username)
      .eq("payment", "取付");
    priorCodTotal = (priorOrders || []).reduce(
      (sum, o: any) => sum + (o.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0),
      0
    );
  }

  return NextResponse.json(
    {
      plan: {
        id: plan.id,
        name: plan.name,
        imageUrl: plan.image_url,
        codLimit: plan.cod_limit || 0,
        priorCodTotal,
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
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
