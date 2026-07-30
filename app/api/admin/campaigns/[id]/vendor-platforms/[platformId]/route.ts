import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// PATCH /api/admin/campaigns/:id/vendor-platforms/:platformId
// body: { name?, orderGiftCap?, tierCaps?: [{ thresholdAmount, perStyleCap }] }
export async function PATCH(req: Request, { params }: { params: { id: string; platformId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const updates: Record<string, any> = {};
  if ("name" in body) updates.name = String(body.name).trim();
  if ("orderGiftCap" in body) updates.order_gift_cap = Number(body.orderGiftCap);

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("vendor_platforms").update(updates).eq("id", params.platformId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body.tierCaps)) {
    await supabase.from("vendor_platform_tier_caps").delete().eq("platform_id", params.platformId);
    const rows = body.tierCaps.map((t: any) => ({
      platform_id: params.platformId,
      threshold_amount: t.thresholdAmount,
      per_style_cap: t.perStyleCap,
    }));
    if (rows.length > 0) {
      const { error: capError } = await supabase.from("vendor_platform_tier_caps").insert(rows);
      if (capError) return NextResponse.json({ error: capError.message }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from("vendor_platforms")
    .select("*, vendor_platform_tier_caps(*)")
    .eq("id", params.platformId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ platform: data });
}
