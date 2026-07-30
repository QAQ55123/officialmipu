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
