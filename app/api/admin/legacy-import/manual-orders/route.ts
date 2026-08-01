import { NextResponse } from "next/server";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { importLegacyOrdersManual } from "@/lib/legacyImport";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/** 上傳手動範本 xlsx，表單欄位：file（xlsx檔案）、commit（"true"才真的寫入，否則只預覽） */
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

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const commit = form.get("commit") === "true";
    if (!file) return NextResponse.json({ error: "請選擇要上傳的 Excel 檔案" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets["訂單明細"] || wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, any>[];

    const result = await importLegacyOrdersManual(rows, commit);
    return NextResponse.json({ success: true, commit, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "匯入失敗" }, { status: 500 });
  }
}
