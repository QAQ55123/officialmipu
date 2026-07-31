import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * POST /api/admin/upload — 上傳圖片檔案到 Supabase Storage，回傳可直接用的公開網址
 *
 * 跟商品的「貼網址」欄位是並存的兩種方式：
 * - 貼網址：適合已經有現成圖床連結或 Google Drive 分享連結的情況
 * - 這支上傳 API：適合手上直接有一張圖檔、想直接丟上去，不用自己先找地方寄放
 *
 * 事前準備：要先到 Supabase 後台 → Storage，建立一個名叫 "product-images" 的
 * public bucket（設為公開，否則上傳後的圖片網址打不開）
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "沒有收到檔案" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "只能上傳圖片檔" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "圖片大小請控制在 4MB 以內" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("product-images")
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: `上傳失敗：${upErr.message}（請確認 Supabase Storage 裡已建立名為 "product-images" 的 public bucket）` },
      { status: 500 }
    );
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
