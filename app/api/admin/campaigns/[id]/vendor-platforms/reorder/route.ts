import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/** 3.2節：店家自訂平台優先順序，拆單決定新採購單送去哪個平台時依此順序嘗試 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "缺少排序資料" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const results = await Promise.all(ids.map((id, index) => supabase.from("vendor_platforms").update({ sort_order: index }).eq("id", id).eq("campaign_id", params.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
