import Home from "../page";

/**
 * 這個路徑（/gift）跟首頁用的是完全同一套畫面跟邏輯，唯一差別是網址路徑不一樣。
 * app/page.tsx 裡會檢查 window.location.pathname 是不是 "/gift"，
 * 是的話，滿贈分類的商品改用「獨立網頁專用價格」（匯款價／取付價兩種台幣金額）顯示，
 * 其餘一般商品跟主站完全一樣。
 * 比照 mibu-app 原本 /remit 的做法，不複製任何程式碼。
 */
export default function GiftSitePage() {
  return <Home />;
}
