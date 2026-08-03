import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 3.2節：廠商採購平台，同一檔期可以有好幾個（如A/B/C），各自單筆採購單贈品總量上限不同 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data: platforms, error } = await supabase
    .from("vendor_platforms")
    .select("*")
    .eq("campaign_id", params.id)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const platformIds = (platforms || []).map((p) => p.id);
  const { data: tierCaps } = platformIds.length
    ? await supabase.from("vendor_platform_tier_caps").select("*").in("platform_id", platformIds)
    : { data: [] };

  return NextResponse.json({
    platforms: (platforms || []).map((p) => ({
      id: p.id,
      name: p.name,
      orderGiftCap: p.order_gift_cap,
      tierCaps: (tierCaps || []).filter((c: any) => c.platform_id === p.id).reduce((acc: any, c: any) => {
        acc[c.gift_tier_id] = c.per_style_cap;
        return acc;
      }, {}),
    })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "請輸入平台名稱" }, { status: 400 });
  const orderGiftCap = Number(body.orderGiftCap) || 0;

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from("vendor_platforms").select("sort_order").eq("campaign_id", params.id).order("sort_order", { ascending: false }).limit(1);
  const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("vendor_platforms")
    .insert({ campaign_id: params.id, name, order_gift_cap: orderGiftCap, sort_order: nextSortOrder })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ platform: data });
}
