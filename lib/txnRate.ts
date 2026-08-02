/**
 * 2.6節：8種交易組合的匯率解析
 * {匯款,取付} x {有滿減(v),無滿減} x {有滿贈,無滿贈}
 * 「滿減(v)」只代表商品是否標記v、用來挑選匯率軌，跟顧客看到的價格折扣無關——顧客一律看原價。
 */

export type TxnMethod = "bank" | "cod";

export interface CampaignRates {
  txn_bank_discount_gift_enabled: boolean;
  txn_bank_discount_gift_rate: number | null;
  txn_bank_discount_nogift_enabled: boolean;
  txn_bank_discount_nogift_rate: number | null;
  txn_bank_nodiscount_gift_enabled: boolean;
  txn_bank_nodiscount_gift_rate: number | null;
  txn_bank_nodiscount_nogift_enabled: boolean;
  txn_bank_nodiscount_nogift_rate: number | null;
  txn_cod_discount_gift_enabled: boolean;
  txn_cod_discount_gift_rate: number | null;
  txn_cod_discount_nogift_enabled: boolean;
  txn_cod_discount_nogift_rate: number | null;
  txn_cod_nodiscount_gift_enabled: boolean;
  txn_cod_nodiscount_gift_rate: number | null;
  txn_cod_nodiscount_nogift_enabled: boolean;
  txn_cod_nodiscount_nogift_rate: number | null;
  [key: string]: any;
}

/** 依「交易方式 × 商品是否標記v(滿減軌) × 是否選滿贈」從8種組合中找出對應的匯率與是否啟用 */
export function resolveTxnRate(
  rates: CampaignRates,
  method: TxnMethod,
  hasDiscountFlag: boolean,
  wantsGift: boolean
): { enabled: boolean; rate: number | null } {
  const key = [
    method === "bank" ? "txn_bank" : "txn_cod",
    hasDiscountFlag ? "discount" : "nodiscount",
    wantsGift ? "gift" : "nogift",
  ].join("_");

  return {
    enabled: Boolean(rates[`${key}_enabled`]),
    rate: (rates[`${key}_rate`] as number | null) ?? null,
  };
}

/** 無條件進位：商品金額 × 匯率 時使用 */
export function ceilToTwd(originalAmount: number, fxRate: number): number {
  return Math.ceil(originalAmount * fxRate);
}

/** 2.4節：取付檔期總上限檢查，達標後按鈕disable */
export function isCodAvailable(campaignCap: number | null, campaignUsed: number): boolean {
  if (campaignCap == null) return true;
  return campaignUsed < campaignCap;
}
