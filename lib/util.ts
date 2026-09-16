import crypto from "crypto";
import bcrypt from "bcryptjs";

/** 會員密碼雜湊（bcrypt） */
export async function hashMemberPw(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyMemberPw(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** 個人頁網址正規化：拿掉查詢參數、結尾斜線、大小寫統一，讓同一個人不同網址寫法能比對出來 */
export function normFb(url: string): string {
  if (!url) return "";
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/^www\./, "");
  u = u.replace(/^m\./, "");
  // facebook.com/profile.php?id=xxx 這種網址，id 是唯一能區分不同人的地方，要保留下來，
  // 其他網址（例如 facebook.com/jia.ming?locale=zh_TW）的問號參數則是雜訊，可以丟掉
  const idMatch = u.match(/[?&]id=(\d+)/);
  u = u.split("?")[0].split("#")[0];
  u = u.replace(/\/+$/, "");
  if (idMatch && /\/profile\.php$/.test(u)) {
    u += "?id=" + idMatch[1];
  }
  return u;
}

/** 產生訂單編號，例如 20260714-183245-482 */
/** 產生訂單編號：純隨機 9 碼數字，好記好唸（唯一性由資料庫的 unique 限制把關） */
export function genOrderNo(): string {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("zh-TW").format(Math.round(n));
}

/**
 * 交易方式的顯示文字：資料庫存的是「匯款」，但要顯示給人看的是「匯款/無卡」。
 * 只轉換顯示，不動資料庫的值（判斷邏輯、匯入驗證都還是用「匯款」）。
 */
export function paymentLabel(payment: string | null | undefined): string {
  if (payment === "匯款") return "匯款/無卡";
  return payment || "";
}

/**
 * 取付額度退回：訂單被取消或刪除時，把它佔用的取付金額還給檔期。
 * 額度分兩組（一般商品 / 滿贈系列商品）各自累計，所以退的時候也要分開算。
 * 沒有這段的話額度只進不出，取消掉的訂單會一直佔著名額。
 */
export async function refundCodQuota(supabase: any, orderId: string): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("campaign_id, payment, order_items(product_name, style, subtotal, series_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.payment !== "取付" || !order.campaign_id) return;

  // 哪些商品是「滿贈系列商品」（店家把贈品拿出來賣的），它們走另一組額度
  const { data: giftProducts } = await supabase
    .from("products")
    .select("name, style, series_id")
    .not("linked_gift_style_id", "is", null);
  const giftKeys = new Set(
    (giftProducts || []).map((p: any) => `${p.series_id}||${p.name}||${p.style || ""}`)
  );

  let regularTotal = 0;
  let giftTotal = 0;
  (order.order_items || []).forEach((it: any) => {
    const key = `${it.series_id}||${it.product_name}||${it.style || ""}`;
    if (giftKeys.has(key)) giftTotal += Number(it.subtotal) || 0;
    else regularTotal += Number(it.subtotal) || 0;
  });
  if (regularTotal === 0 && giftTotal === 0) return;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("cod_campaign_used, gift_cod_campaign_used")
    .eq("id", order.campaign_id)
    .maybeSingle();
  if (!campaign) return;

  await supabase
    .from("campaigns")
    .update({
      cod_campaign_used: Math.max(0, (Number(campaign.cod_campaign_used) || 0) - regularTotal),
      gift_cod_campaign_used: Math.max(0, (Number(campaign.gift_cod_campaign_used) || 0) - giftTotal),
    })
    .eq("id", order.campaign_id);
}
