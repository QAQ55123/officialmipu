import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { syncCostSheetForCampaign } from "@/lib/costSheetSync";

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
    return NextResponse.json({ ok: true, tabName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "同步失敗" }, { status: 500 });
  }
}
