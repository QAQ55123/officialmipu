import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { syncCostSheetForCampaign, syncCostSummary, type CostTabRefs } from "@/lib/costSheetSync";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 3.3節第9項：把這個檔期的成本明細同步到 Google 試算表（成本SHEET） */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    const { tabName } = await syncCostSheetForCampaign(params.id);
    // 總覽是跨檔期彙總，改了任何一個檔期都要重算，不然總覽的數字會跟各分頁對不上
    const supabase = getSupabaseAdmin();
    const { data: campaigns } = await supabase.from("campaigns").select("id");
    const refs: CostTabRefs[] = [];
    for (const c of campaigns || []) {
      try {
        refs.push(await syncCostSheetForCampaign(c.id));
      } catch {
        // 某個檔期失敗就跳過，總覽仍然更新其他檔期
      }
    }
    await syncCostSummary(refs);
    return NextResponse.json({ ok: true, tabName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "同步失敗" }, { status: 500 });
  }
}
