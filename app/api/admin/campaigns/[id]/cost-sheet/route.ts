import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/campaigns/:id/cost-sheet
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("cost_sheets").select("*").eq("campaign_id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data?.data ?? null });
}

// PUT /api/admin/campaigns/:id/cost-sheet — 整份覆蓋儲存
// body: { data: string[][] }
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  if (!Array.isArray(body.data)) return NextResponse.json({ error: "格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cost_sheets")
    .upsert({ campaign_id: params.id, data: body.data, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
