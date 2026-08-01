/**
 * 滿贈規則核心計算邏輯（依《系統規格書 v0.3》2.7節與第3節）
 *   - 2.7（顧客結帳當下）：對「這張購物車自己」的商品做拆組最佳化，
 *     套用「廠商單張採購單贈品上限」算出真實可得數量，沒有額外封頂。
 *   - 第3節（內部拆單工具）：把所有顧客的商品混在一起做更大範圍的拆單，
 *     用同一套 bin-packing 邏輯，只是範圍改成全部顧客。
 * 這裡的函式故意設計成「範圍無關」：呼叫端自己決定要傳入
 * 一張購物車的商品，還是全部顧客的商品。
 */

export interface GiftableItem {
  id: string;
  amount: number; // 原幣金額（單件不可切割）
}

export interface SplitGroup {
  itemIds: string[];
  groupAmount: number;
  quota: number; // min(floor(groupAmount / baseUnit), vendorOrderGiftCap)
}

/**
 * 把商品清單拆分成多組，讓總可選贈品數量最大化。
 * 限制：單件商品金額不可切割；每組贈品上限 = vendorOrderGiftCap。
 * 用近似演算法（貪婪法）：依金額由大到小排序，逐一嘗試放進「還沒滿的組」，滿了就開新組。
 */
export function splitIntoGroups(
  items: GiftableItem[],
  baseUnit: number,
  vendorOrderGiftCap: number
): SplitGroup[] {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const groups: SplitGroup[] = [];

  const quotaFor = (amount: number) =>
    Math.min(Math.floor(amount / baseUnit), vendorOrderGiftCap);

  for (const item of sorted) {
    let placed = false;
    for (const g of groups) {
      const newAmount = g.groupAmount + item.amount;
      if (quotaFor(newAmount) >= quotaFor(g.groupAmount)) {
        g.itemIds.push(item.id);
        g.groupAmount = newAmount;
        g.quota = quotaFor(newAmount);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({
        itemIds: [item.id],
        groupAmount: item.amount,
        quota: quotaFor(item.amount),
      });
    }
  }

  return groups;
}

/** 總可選贈品數量 = 所有分組 quota 加總 */
export function totalQuota(groups: SplitGroup[]): number {
  return groups.reduce((sum, g) => sum + g.quota, 0);
}

/** 單一款式的可選上限 = floor(該組金額 ÷ 該款式門檻金額)（2.7節） */
export function styleMaxForGroup(groupAmount: number, thresholdAmount: number): number {
  return Math.floor(groupAmount / thresholdAmount);
}

/** 無條件進位：商品金額 × 匯率 時使用（2.6節結帳匯率計算） */
export function ceilToTwd(originalAmount: number, fxRate: number): number {
  return Math.ceil(originalAmount * fxRate);
}
