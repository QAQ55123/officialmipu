import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function DELETE(req: Request, { params }: { params: { id: string; purchaseId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("vendor_extra_purchases").delete().eq("id", params.purchaseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
