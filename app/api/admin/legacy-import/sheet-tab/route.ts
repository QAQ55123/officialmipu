import { NextResponse } from "next/server";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { importLegacySheetTab } from "@/lib/legacyImport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 解析並匯入舊試算表其中一個分頁 body: { sheetId, tabName, commit } */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const sheetId = String(body.sheetId || "").trim();
  const tabName = String(body.tabName || "").trim();
  const commit = body.commit === true;
  if (!sheetId || !tabName) return NextResponse.json({ error: "缺少試算表 ID 或分頁名稱" }, { status: 400 });

  try {
    const result = await importLegacySheetTab(sheetId, tabName, commit);
    return NextResponse.json({ success: true, commit, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "匯入失敗" }, { status: 500 });
  }
}
