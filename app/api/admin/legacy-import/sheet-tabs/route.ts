import { NextResponse } from "next/server";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { listLegacySheetTabs } from "@/lib/legacyImport";

export const dynamic = "force-dynamic";

/** 列出舊試算表的所有分頁名稱 ?sheetId=xxx */
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const sheetId = (searchParams.get("sheetId") || "").trim();
  if (!sheetId) return NextResponse.json({ error: "請輸入舊試算表 ID" }, { status: 400 });

  try {
    const tabs = await listLegacySheetTabs(sheetId);
    return NextResponse.json({ ok: true, tabs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "讀取失敗，請確認試算表 ID 正確、且已分享給服務帳戶" }, { status: 500 });
  }
}
