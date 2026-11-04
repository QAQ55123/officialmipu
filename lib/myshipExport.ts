import { getSupabaseAdmin } from "./supabase";

export type MyshipRow = { account: string; amount: number };
export type MyshipGroup = { productName: string; rows: MyshipRow[] };
export type MyshipExportResult = {
  campaignName: string;
  groups: MyshipGroup[];
  totalCustomers: number;
  overLimit: string[]; // 金額超過賣貨便單一規格上限的，要另外手動處理
};

const MAX_ROWS_PER_PRODUCT = 50; // 賣貨便規定：一個商品最多 50 個規格
const MYSHIP_PRICE_MAX = 20000;

/**
 * 產生賣貨便批次上架用的資料：每位顧客一個「規格」（同一人多張訂單合併），規格名稱是會員名稱，價格是他這次要付的金額。
 * 金額＝商品小計＋應收運費－已收金額（也就是尚欠），跟成本表的客戶明細算法一致。
 */
export async function computeMyshipExport(campaignId: string): Promise<MyshipExportResult> {
  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("name").eq("id", campaignId).maybeSingle();
  if (!campaign) throw new Error("找不到這個檔期");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, username, paid_amount, order_items(subtotal)")
    .eq("campaign_id", campaignId);
  const orderIds = (orders || []).map((o: any) => o.id);

  // 顧客運費：出貨批次算出來的加總
  const { data: batches } = orderIds.length
    ? await supabase.from("shipping_batches").select("order_id, customer_shipping_fee").in("order_id", orderIds)
    : { data: [] };
  const feeByOrder = new Map<string, number>();
  (batches || []).forEach((b: any) => {
    feeByOrder.set(b.order_id, (feeByOrder.get(b.order_id) || 0) + (Number(b.customer_shipping_fee) || 0));
  });

  // 同一位顧客在這個檔期的多張訂單合併成一列、金額加總（訂單上的帳號不分大小寫視為同一人）
  const byCustomer = new Map<string, { username: string; amount: number }>();
  (orders || []).forEach((o: any) => {
    const itemsTotal = (o.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
    const fee = feeByOrder.get(o.id) || 0;
    const paid = Number(o.paid_amount) || 0;
    const owed = itemsTotal + fee - paid;
    const key = String(o.username || "").trim().toLowerCase();
    const cur = byCustomer.get(key) || { username: String(o.username || "").trim(), amount: 0 };
    cur.amount += owed;
    byCustomer.set(key, cur);
  });

  // 規格名稱用會員名稱；沒有會員名稱的（例如沒對到會員的舊訂單）用訂單上的帳號
  const displayNameByUsername = new Map<string, string>();
  // 只查這個檔期有下單的人（一次撈全部會員會被 Supabase 預設的 1000 筆上限截斷）
  const orderUsernames = Array.from(new Set((orders || []).map((o: any) => String(o.username || "").trim()).filter(Boolean)));
  for (let i = 0; i < orderUsernames.length; i += 200) {
    const { data: members } = await supabase
      .from("members")
      .select("username, display_name")
      .in("username", orderUsernames.slice(i, i + 200));
    (members || []).forEach((m: any) => {
      if (m.display_name) displayNameByUsername.set(String(m.username).trim().toLowerCase(), m.display_name);
    });
  }

  const overLimit: string[] = [];
  const rows: MyshipRow[] = [];
  byCustomer.forEach(({ username, amount: owed }, key) => {
    const name = displayNameByUsername.get(key) || username;
    const amount = Math.max(0, Math.ceil(owed));
    if (amount > MYSHIP_PRICE_MAX) {
      overLimit.push(`${name}（NT$${amount}）`);
      return;
    }
    rows.push({ account: name, amount });
  });
  rows.sort((a, b) => a.account.localeCompare(b.account));

  // 賣貨便一個商品最多 50 個規格，超過就拆成第2、第3個商品
  const groups: MyshipGroup[] = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_PRODUCT) {
    const chunk = rows.slice(i, i + MAX_ROWS_PER_PRODUCT);
    const idx = Math.floor(i / MAX_ROWS_PER_PRODUCT);
    const productName = rows.length <= MAX_ROWS_PER_PRODUCT ? campaign.name : `${campaign.name}(${idx + 1})`;
    groups.push({ productName, rows: chunk });
  }

  return { campaignName: campaign.name, groups, totalCustomers: rows.length, overLimit };
}
