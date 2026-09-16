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
 * 產生賣貨便批次上架用的資料：每位顧客一個「規格」，價格是他這次要付的金額。
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

  const overLimit: string[] = [];
  const rows: MyshipRow[] = [];
  (orders || []).forEach((o: any) => {
    const itemsTotal = (o.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
    const fee = feeByOrder.get(o.id) || 0;
    const paid = Number(o.paid_amount) || 0;
    const amount = Math.max(0, Math.ceil(itemsTotal + fee - paid));
    if (amount > MYSHIP_PRICE_MAX) {
      overLimit.push(`${o.username}（NT$${amount}）`);
      return;
    }
    rows.push({ account: o.username, amount });
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
