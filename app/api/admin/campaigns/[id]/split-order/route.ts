import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { computeSplitOrderBatch } from "@/lib/splitOrderEngine";

// GET /api/admin/campaigns/:id/split-order — 這個檔期所有拆單批次列表
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_purchase_batches")
    .select("*")
    .eq("campaign_id", params.id)
    .order("computed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data });
}

// POST /api/admin/campaigns/:id/split-order — 觸發一次新的拆單試算
// 支援檔期進行中隨時重新試算（3.1節），每次呼叫都會產生一筆新的試算批次
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  try {
    const batchId = await computeSplitOrderBatch(params.id);
    return NextResponse.json({ batchId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
