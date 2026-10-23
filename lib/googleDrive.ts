import { google } from "googleapis";
import { getGoogleCredentials } from "@/lib/googleSheets";

export interface DriveImageFile {
  id: string;
  name: string;
}

/** 從雲端資料夾連結取出資料夾 ID；也接受直接貼 ID */
export function parseDriveFolderId(raw: string): string | null {
  const u = String(raw || "").trim();
  if (!u) return null;
  let m = u.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = u.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(u)) return u;
  return null;
}

/** 商品名稱、款式名稱的比對鍵：前後空白去掉，英文不分大小寫（不去副檔名，名稱本身可能有「Vol.2」這種點） */
export function normalizeImageKey(s: string): string {
  return String(s || "").trim().toLowerCase();
}

/** 雲端檔名的比對鍵：只去掉圖片副檔名，其餘跟名稱比對規則相同 */
export function normalizeFileKey(fileName: string): string {
  return normalizeImageKey(String(fileName || "").trim().replace(/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)$/i, ""));
}

/** 列出資料夾裡的所有圖片（只看這一層，不往子資料夾找）。
 *  服務帳號要被共用到這個資料夾才讀得到。 */
export async function listDriveFolderImages(folderId: string): Promise<DriveImageFile[]> {
  const { email, key } = getGoogleCredentials();
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const files: DriveImageFile[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      orderBy: "name",
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    (res.data.files || []).forEach((f: any) => {
      if (f.id && f.name) files.push({ id: f.id, name: f.name });
    });
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}
