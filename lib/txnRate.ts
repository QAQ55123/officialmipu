/**
 * 2.6節：8種交易組合的匯率解析
 * {匯款,取付} x {有滿減(v),無滿減} x {有滿贈,無滿贈}
 *
 * 「滿減(v)」在這裡只代表商品是否標記v、用來挑選匯率軌，
 * 與顧客看到的價格折扣無關 —— 顧客一律看原價，不會顯示任何折扣。
 */

export type TxnMethod = "bank" | "cod";

export interface CampaignRates {
  txnBankDiscountGiftEnabled: boolean;
  txnBankDiscountGiftRate: number | null;
  txnBankDiscountNogiftEnabled: boolean;
  txnBankDiscountNogiftRate: number | null;
  txnBankNodiscountGiftEnabled: boolean;
  txnBankNodiscountGiftRate: number | null;
  txnBankNodiscountNogiftEnabled: boolean;
  txnBankNodiscountNogiftRate: number | null;
  txnCodDiscountGiftEnabled: boolean;
  txnCodDiscountGiftRate: number | null;
  txnCodDiscountNogiftEnabled: boolean;
  txnCodDiscountNogiftRate: number | null;
  txnCodNodiscountGiftEnabled: boolean;
  txnCodNodiscountGiftRate: number | null;
  txnCodNodiscountNogiftEnabled: boolean;
  txnCodNodiscountNogiftRate: number | null;
}

/**
 * 依「交易方式 × 商品是否標記v(滿減軌) × 是否選滿贈」
 * 從8種組合中找出對應的匯率與是否啟用
 */
export function resolveTxnRate(
  rates: CampaignRates,
  method: TxnMethod,
  hasDiscountFlag: boolean,
  wantsGift: boolean
): { enabled: boolean; rate: number | null } {
  const key = [
    method === "bank" ? "txnBank" : "txnCod",
    hasDiscountFlag ? "Discount" : "Nodiscount",
    wantsGift ? "Gift" : "Nogift",
  ].join("");

  const enabledKey = (key + "Enabled") as keyof CampaignRates;
  const rateKey = (key + "Rate") as keyof CampaignRates;

  return {
    enabled: Boolean(rates[enabledKey]),
    rate: (rates[rateKey] as number | null) ?? null,
  };
}

/** 取付檔期總上限檢查：達標後自動關閉取付選項 */
export function isCodAvailable(campaignCap: number | null, campaignUsed: number): boolean {
  if (campaignCap == null) return true; // 沒設上限就一律開放
  return campaignUsed < campaignCap;
}
