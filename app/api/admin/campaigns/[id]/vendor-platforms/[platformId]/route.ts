import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** PATCH body: { name?, orderGiftCap?, tierCaps?: { [giftTierId]: number } }
 *  tierCaps 是這個平台在各門檻等級的每款式上限，一次整包覆蓋式更新（upsert） */
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
  if ("orderGiftCap" in body) updates.order_gift_cap = Number(body.orderGiftCap) || 0;
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("vendor_platforms").update(updates).eq("id", params.platformId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.tierCaps && typeof body.tierCaps === "object") {
    const rows = Object.entries(body.tierCaps).map(([giftTierId, cap]) => ({
      platform_id: params.platformId,
      gift_tier_id: giftTierId,
      per_style_cap: Number(cap) || 0,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("vendor_platform_tier_caps").upsert(rows, { onConflict: "platform_id,gift_tier_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string; platformId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_platforms").delete().eq("id", params.platformId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
