/**
 * 滿贈規則核心計算邏輯（規格書 2.7 節）
 *
 * 把商品清單（單件不可切割）拆分成多組，讓總可選贈品數量最大化。
 * 這裡的函式故意設計成「範圍無關」：呼叫端自己決定要傳入一張購物車的商品，
 * 還是全部顧客的商品（第3節拆單工具會用同一套邏輯，只是範圍改成全部顧客）。
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
 * 貪婪演算法：依金額由大到小排序，逐一嘗試放進「還沒滿的組」，滿了就開新組。
 * 這樣才能重現規格書範例裡「700獨立一組＋其餘350一組」這種效果。
 */
export function splitIntoGroups(
  items: GiftableItem[],
  baseUnit: number,
  vendorOrderGiftCap: number
): SplitGroup[] {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const groups: SplitGroup[] = [];

  const quotaFor = (amount: number) => Math.min(Math.floor(amount / baseUnit), vendorOrderGiftCap);

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
      groups.push({ itemIds: [item.id], groupAmount: item.amount, quota: quotaFor(item.amount) });
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
