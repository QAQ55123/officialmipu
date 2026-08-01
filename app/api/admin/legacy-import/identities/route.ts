import { NextResponse } from "next/server";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { importLegacyIdentitiesFromCsv } from "@/lib/legacyImport";

export const dynamic = "force-dynamic";

/** 上傳身份名冊 CSV，表單欄位：file（CSV檔案）、commit（"true"才真的寫入，否則只預覽） */
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
    if (!file) return NextResponse.json({ error: "請選擇要上傳的 CSV 檔案" }, { status: 400 });

    const text = await file.text();
    const result = await importLegacyIdentitiesFromCsv(text, commit);
    return NextResponse.json({ ok: true, commit, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "匯入失敗" }, { status: 500 });
  }
}
