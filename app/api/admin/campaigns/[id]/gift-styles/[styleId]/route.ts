import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { id: string; styleId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const updates: Record<string, any> = {};
  if ("styleName" in body) updates.style_name = String(body.styleName).trim();
  if ("thresholdAmount" in body) updates.threshold_amount = Number(body.thresholdAmount);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("gift_styles").update(updates).eq("id", params.styleId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftStyle: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string; styleId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("gift_styles").delete().eq("id", params.styleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
