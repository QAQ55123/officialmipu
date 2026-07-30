/**
 * 第3節內部工具：多平台廠商規則計算
 * 依規格書 v0.3：
 *   - 廠商贈品門檻金額與對應折扣金額三平台共用同一份
 *   - 各平台各自的單張採購單贈品總量上限、以及各平台在每個門檻等級的每款上限
 *   - 一張採購單建立時指定平台，之後可隨時更改，規則以新平台重新計算
 */

export interface TierConfig {
  thresholdAmount: number; // 如 100/200/300/400
  discountAmount: number; // 對應折扣，如 15/30/50/65
}

export interface PlatformConfig {
  id: string;
  name: string;
  orderGiftCap: number; // 該平台單張採購單贈品總量上限
  tierCaps: Record<number, number>; // 門檻金額 -> 每款上限
}

/** 依訂單金額找出所在的門檻等級（取符合門檻中金額最大的那個） */
export function bracketFor(amount: number, tiers: TierConfig[]): TierConfig | null {
  const sorted = [...tiers].sort((a, b) => b.thresholdAmount - a.thresholdAmount);
  for (const t of sorted) {
    if (amount >= t.thresholdAmount) return t;
  }
  return null;
}

/** 該採購單在所選平台下的贈品總量上限 */
export function orderQuotaForPlatform(
  amount: number,
  baseUnit: number,
  platform: PlatformConfig
): number {
  return Math.min(Math.floor(amount / baseUnit), platform.orderGiftCap);
}

/**
 * 單一款式在此採購單的最終上限 = min(
 *   依款式門檻金額對這單金額算出的上限,
 *   所選平台在對應門檻等級的每款上限
 * )
 */
export function styleMaxForPlatform(
  groupAmount: number,
  styleThresholdAmount: number,
  platform: PlatformConfig,
  bracketThreshold: number | null
): number {
  const moneyBased = Math.floor(groupAmount / styleThresholdAmount);
  const platformCap = bracketThreshold != null ? platform.tierCaps[bracketThreshold] ?? 1 : 1;
  return Math.min(moneyBased, platformCap);
}

/** 實收金額 = 該單小計 − 對應門檻的廠商折扣金額 + 額外調整加總 */
export function netAmount(subtotal: number, discount: number, adjustmentSum: number): number {
  return subtotal - discount + adjustmentSum;
}

/** 解析「額外調整」欄位的原始輸入文字，抓出所有數字加總（如 "-20 -30" -> -50） */
export function parseAdjustmentText(text: string): number {
  const matches = (text || "").match(/-?\d+(\.\d+)?/g);
  if (!matches) return 0;
  return matches.reduce((sum, n) => sum + parseFloat(n), 0);
}
