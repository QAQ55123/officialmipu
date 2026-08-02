import { getSupabaseAdmin } from "./supabase";

const BUCKET = "product-images";

/** 從公開網址反推出這個檔案在 Storage 裡的實際路徑，抓不到就回傳 null */
function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/** 刪除一批圖片網址對應的 Storage 檔案（不是我們自己 Storage 裡的網址會被忽略，不會報錯） */
export async function deleteStorageFiles(urls: Array<string | null | undefined>) {
  const paths = Array.from(new Set(urls.map(extractStoragePath).filter((p): p is string => !!p)));
  if (paths.length === 0) return;
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET).remove(paths);
}
