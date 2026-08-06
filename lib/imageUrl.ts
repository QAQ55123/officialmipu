/** 把 Google Drive「分享連結」（給人點開瀏覽用）轉成可以直接當 <img src> 用的圖片網址。
 *  前提：該 Drive 檔案要設成「知道連結的任何人都可查看」，否則不管轉成什麼格式都無法內嵌顯示。
 *  非 Google Drive 的網址（例如其他圖床）會原樣回傳，不做任何轉換。 */
export function toDirectImageUrl(rawUrl: string): string {
  const u = String(rawUrl || "").trim();
  if (!u) return u;
  let m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (!m) m = u.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (!m) m = u.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return u;
}

/**
 * 依實際顯示尺寸取得對應大小的圖片網址（Google Drive 縮圖服務支援指定寬度）。
 * 小卡片用小圖、燈箱才用大圖，避免每個位置都下載 1000px 原圖造成載入緩慢。
 * 傳入的網址已經是 toDirectImageUrl() 轉換過的結果；非 Google Drive 的網址原樣回傳。
 *
 * 尺寸選擇（考慮高解析螢幕，實際取 2 倍尺寸避免模糊）：
 *   thumb  = 商品格線卡片、購物車、滿贈款式小圖等（顯示約 100~200px）
 *   medium = 商品主視覺（顯示約 400~500px）
 *   large  = 燈箱放大檢視
 */
export function sizedImageUrl(url: string | null | undefined, size: "thumb" | "medium" | "large" = "medium"): string {
  const u = String(url || "").trim();
  if (!u) return u;
  if (!u.includes("drive.google.com/thumbnail")) return u;
  const width = size === "thumb" ? 400 : size === "medium" ? 1000 : 1600;
  return u.replace(/([?&])sz=w\d+/, `$1sz=w${width}`);
}
