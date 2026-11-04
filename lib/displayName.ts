/**
 * 會員名稱（匯出賣貨便時顯示的名稱）的格式規則，前台、後台、API 共用。
 * 這支檔案不能引用任何伺服器端套件，前端也會用到。
 */
export const DISPLAY_NAME_MAX = 20;

/** 前後空白去掉 */
export function normalizeDisplayName(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** 回傳錯誤訊息；格式正確回傳 null。長度以「字」計算，中文、英文、數字都是一個字算一個 */
export function displayNameFormatError(name: string): string | null {
  const len = Array.from(name).length;
  if (len < 1) return "請輸入會員名稱";
  if (len > DISPLAY_NAME_MAX) return `會員名稱最多 ${DISPLAY_NAME_MAX} 個字`;
  return null;
}
