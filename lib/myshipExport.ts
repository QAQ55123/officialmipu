import { getSupabaseAdmin } from "./supabase";
import { selectEq, selectIn } from "./dbBatch";

export type MyshipRow = { account: string; amount: number; qty: number }; // qty：已在賣貨便下單的批次填 0
export type MyshipGroup = { productName: string; rows: MyshipRow[] };
export type MyshipExportResult = {
  campaignName: string;
  groups: MyshipGroup[];
  totalCustomers: number;
  overLimit: string[]; // 金額超過賣貨便單一規格上限的，要另外手動處理
};

const MAX_ROWS_PER_PRODUCT = 50; // 賣貨便規定：一個商品最多 50 個規格
const MYSHIP_PRICE_MAX = 20000;

const NOT_ARRIVED_PRICE = 999; // 還沒出貨的先用 999 佔位，等真的有出貨批次再改名稱跟金額

/**
 * 產生賣貨便批次上架用的資料：每位顧客依出貨批次產生規格（同一人多張訂單合併），規格名稱用會員名稱。
 * - 還沒建任何出貨批次：「A(未到)」，價格 999。
 * - 只有 1 批且全部出完：「A」，價格＝剩餘款項＋這批運費。
 * - 有好幾批：「A 1.0」＝剩餘款項＋第1批運費；「A 2.0」之後每批只算那一批的運費。
 * - 還有沒出貨的品項：最後多一列「A N.0(未到)」，價格 999。
 * 剩餘款項＝商品小計－已收。金額照實填（0 元就是 0），台幣無條件進位。
 * 數量：出貨作業頁勾了「已下單」的批次填 0，其餘（含未到）填 1。
 */
export async function computeMyshipExport(campaignId: string): Promise<MyshipExportResult> {
  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("name").eq("id", campaignId).maybeSingle();
  if (!campaign) throw new Error("找不到這個檔期");

  const orders = await selectEq(
    supabase,
    "orders",
    "id, username, paid_amount, created_at, order_items(id, qty, subtotal), order_gift_selections(id, qty)",
    "campaign_id",
    campaignId
  );
  const orderIds = orders.map((o: any) => o.id);

  // 出貨批次（依建立時間排序，決定第幾批）與批次裡的品項（判斷還有沒有沒出貨的）
  const batches = await selectIn(supabase, "shipping_batches", "id, order_id, customer_shipping_fee, created_at, myship_ordered", "order_id", orderIds);
  batches.sort((x: any, y: any) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
  const batchItems = await selectIn(
    supabase,
    "shipping_batch_items",
    "id, order_item_id, order_gift_selection_id, qty",
    "shipping_batch_id",
    batches.map((b: any) => b.id)
  );
  const shippedQty = new Map<string, number>();
  batchItems.forEach((bi: any) => {
    const key = bi.order_item_id || bi.order_gift_selection_id;
    if (key) shippedQty.set(key, (shippedQty.get(key) || 0) + (Number(bi.qty) || 0));
  });

  // 同一位顧客在這個檔期的多張訂單合併（訂單上的帳號不分大小寫視為同一人）
  type Cust = { username: string; itemsTotal: number; paid: number; fees: number[]; ordered: boolean[]; hasUnshipped: boolean; orderIds: Set<string> };
  const byCustomer = new Map<string, Cust>();
  orders.forEach((o: any) => {
    const key = String(o.username || "").trim().toLowerCase();
    const cur = byCustomer.get(key) || { username: String(o.username || "").trim(), itemsTotal: 0, paid: 0, fees: [], ordered: [], hasUnshipped: false, orderIds: new Set<string>() };
    cur.itemsTotal += (o.order_items || []).reduce((sum: number, it: any) => sum + (Number(it.subtotal) || 0), 0);
    cur.paid += Number(o.paid_amount) || 0;
    cur.orderIds.add(o.id);
    const lines = [...(o.order_items || []), ...(o.order_gift_selections || [])];
    if (lines.some((l: any) => (Number(l.qty) || 0) > (shippedQty.get(l.id) || 0))) cur.hasUnshipped = true;
    byCustomer.set(key, cur);
  });
  // 每位顧客的出貨批次運費，依建立時間排序（跨訂單合併後再編號）
  batches.forEach((b: any) => {
    for (const cust of byCustomer.values()) {
      if (cust.orderIds.has(b.order_id)) {
        cust.fees.push(Number(b.customer_shipping_fee) || 0);
        cust.ordered.push(!!b.myship_ordered);
        break;
      }
    }
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
  const customers = Array.from(byCustomer.entries())
    .map(([key, c]) => ({ ...c, name: displayNameByUsername.get(key) || c.username }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const push = (account: string, amount: number, qty = 1) => {
    if (amount > MYSHIP_PRICE_MAX) {
      overLimit.push(`${account}（NT$${amount}）`);
      return;
    }
    rows.push({ account, amount, qty });
  };
  // 每次都是整批重新匯出：已經在賣貨便下單的批次數量填 0，避免顧客重複下單；（未到）一律填 1
  const qtyOf = (c: { ordered: boolean[] }, i: number) => (c.ordered[i] ? 0 : 1);
  customers.forEach((c) => {
    if (c.fees.length === 0) {
      push(`${c.name}(未到)`, NOT_ARRIVED_PRICE);
      return;
    }
    const remaining = c.itemsTotal - c.paid; // 剩餘款項
    const amounts = c.fees.map((fee, i) => Math.ceil(i === 0 ? remaining + fee : fee));
    if (c.fees.length === 1 && !c.hasUnshipped) {
      push(c.name, amounts[0], qtyOf(c, 0));
      return;
    }
    amounts.forEach((amt, i) => push(`${c.name} ${i + 1}.0`, amt, qtyOf(c, i)));
    if (c.hasUnshipped) push(`${c.name} ${c.fees.length + 1}.0(未到)`, NOT_ARRIVED_PRICE);
  });

  // 賣貨便一個商品最多 50 個規格，超過就拆成第2、第3個商品
  const groups: MyshipGroup[] = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_PRODUCT) {
    const chunk = rows.slice(i, i + MAX_ROWS_PER_PRODUCT);
    const idx = Math.floor(i / MAX_ROWS_PER_PRODUCT);
    const productName = rows.length <= MAX_ROWS_PER_PRODUCT ? campaign.name : `${campaign.name}(${idx + 1})`;
    groups.push({ productName, rows: chunk });
  }

  return { campaignName: campaign.name, groups, totalCustomers: customers.length, overLimit };
}
