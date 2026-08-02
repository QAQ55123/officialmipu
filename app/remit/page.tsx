import Home from "../page";

/**
 * 這個路徑（/remit）跟首頁用的是完全同一套畫面跟邏輯，唯一差別是網址路徑不一樣。
 * app/page.tsx 裡的 useEffect 會檢查 window.location.pathname 是不是 "/remit"，
 * 是的話就固定只能匯款（個別企劃有勾選「限定連結取付」的話取付選項還是會出現）。
 * 這裡分享給特定客人用，跟一般的首頁網址完全分開，不會互相影響。
 */
export default function RemitPage() {
  return <Home />;
}
