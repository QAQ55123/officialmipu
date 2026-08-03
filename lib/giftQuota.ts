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
 * 貪婪演算法：依金額由大到小排序，對每一件商品，比較「併入某個現有組」跟「自己獨立成一組」
 * 哪一種能拿到更多配額，只有合併確實比分開放拿到更多時才合併——不能只看合併後那一組本身
 * 配額有沒有變差，因為兩個各自都能拿到上限的商品，分開放通常比合併在一起拿到更多（規格書範例：
 * 700+350，cap=5、unit=100，分開算是 700→5 + 350→3 = 8，合併成1050卻只有 min(10,5)=5，
 * 分開放才是正確答案）。
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
    const standaloneQuota = quotaFor(item.amount);

    // 找出「併入這一組」邊際增加配額最多的組
    let bestGroupIndex = -1;
    let bestMarginalGain = -1;
    groups.forEach((g, idx) => {
      const marginalGain = quotaFor(g.groupAmount + item.amount) - g.quota;
      if (marginalGain > bestMarginalGain) {
        bestMarginalGain = marginalGain;
        bestGroupIndex = idx;
      }
    });

    // 併入最佳組能拿到的邊際配額「大於等於」自己獨立成一組時就合併——打平的話優先合併，
    // 因為合併不會讓總配額變少，還能避免特定門檻的滿贈款式因為拆組打散而算不到（規格書沒有
    //明講打平時要選哪邊，但合併對總量無害、對個別款式門檻更有利，所以優先合併）
    if (bestGroupIndex >= 0 && bestMarginalGain >= standaloneQuota) {
      const g = groups[bestGroupIndex];
      g.itemIds.push(item.id);
      g.groupAmount += item.amount;
      g.quota = quotaFor(g.groupAmount);
    } else {
      groups.push({ itemIds: [item.id], groupAmount: item.amount, quota: standaloneQuota });
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
