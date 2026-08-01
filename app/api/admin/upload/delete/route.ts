import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { deleteStorageFiles } from "@/lib/storage";

/**
 * POST /api/admin/upload/delete
 * body: { url }
 * 用在表單裡「換掉一張已上傳的圖」或「移除整列款式」時，把還沒被儲存到資料庫的舊圖片
 * 立刻從 Storage 清掉，避免累積用不到的孤兒檔案（這是新站額外加的，mibu-app 原本沒有這個機制）
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const url = String(body.url || "");
  if (!url) return NextResponse.json({ ok: true });

  await deleteStorageFiles([url]).catch(() => {});
  return NextResponse.json({ ok: true });
}
