/**
 * 3.1/3.4節：拆單自動最佳化——把整個檔期所有顧客的商品品項攤開，
 * 依折扣門檻貪婪分組，讓總折扣金額最大化。
 *
 * 跟 giftQuota.ts 的滿贈拆單邏輯是同一個家族（貪婪法：依金額大到小排序，
 * 每一件比較「併入現有組」vs「自己獨立成一組」哪個對總價值更有利），
 * 只是這裡的「價值」換成折扣門檻對應的折扣金額，不是滿贈配額。
 *
 * 屬打包最佳化問題，貪婪法不保證100%最優解，供店家事後手動微調（3.4節）。
 */

export interface SplitPiece {
  id: string; // orderItemId，同一個 order_item 的多件數量會展開成多個 piece
  amount: number; // 原幣金額（單件不可切割）
}

export interface DiscountTier {
  thresholdAmount: number;
  discountAmount: number;
}

export interface DiscountGroup {
  pieceIds: string[];
  groupAmount: number;
  discountValue: number;
}

/** 找出這個金額符合的最高折扣門檻，回傳對應折扣金額（沒有符合任何門檻則為0） */
function bestDiscountFor(amount: number, tiers: DiscountTier[]): number {
  const matched = tiers.filter((t) => amount >= t.thresholdAmount);
  if (matched.length === 0) return 0;
  return Math.max(...matched.map((t) => t.discountAmount));
}

export function splitByDiscountTiers(pieces: SplitPiece[], tiers: DiscountTier[]): DiscountGroup[] {
  const sorted = [...pieces].sort((a, b) => b.amount - a.amount);
  const groups: DiscountGroup[] = [];

  for (const piece of sorted) {
    const standaloneValue = bestDiscountFor(piece.amount, tiers);

    let bestGroupIndex = -1;
    let bestMarginalGain = -1;
    groups.forEach((g, idx) => {
      const marginalGain = bestDiscountFor(g.groupAmount + piece.amount, tiers) - g.discountValue;
      if (marginalGain > bestMarginalGain) {
        bestMarginalGain = marginalGain;
        bestGroupIndex = idx;
      }
    });

    // 打平時優先合併（理由同 giftQuota.ts：合併對總量無害，還能減少採購單數量方便管理）
    if (bestGroupIndex >= 0 && bestMarginalGain >= standaloneValue) {
      const g = groups[bestGroupIndex];
      g.pieceIds.push(piece.id);
      g.groupAmount += piece.amount;
      g.discountValue = bestDiscountFor(g.groupAmount, tiers);
    } else {
      groups.push({ pieceIds: [piece.id], groupAmount: piece.amount, discountValue: standaloneValue });
    }
  }

  return groups;
}
