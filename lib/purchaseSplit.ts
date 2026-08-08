/**
 * 3.1/3.4節：拆單自動最佳化——把整個檔期所有顧客的商品品項攤開，分組成給廠商的採購單，
 * 目標是讓「折扣金額 ＋ 贈品價值」的總和最大化（規格書3.1節的目標函數）。
 *
 * 兩個關鍵限制（都是實際踩過的坑）：
 *   ① 折扣只算「有滿減標記(v)」的商品金額。無滿減商品照樣要分配到採購單（要跟廠商買），
 *      但它的金額不貢獻折扣門檻，不然折扣會算多。
 *   ② 每張採購單「每款上限」通常是1，所以拆成兩組，同一個滿贈款式就能各拿1個。
 *      也就是說「合併拿大折扣」不一定比「拆開多拿贈品」划算，必須換算成同幣值一起比。
 *      折扣是人民幣、贈品估值是台幣售價，用檔期設定的「拆單試算匯率」換算。
 *
 * 屬打包最佳化問題，貪婪法不保證100%最優解，供店家事後手動微調（3.4節）。
 */

export interface SplitPiece {
  id: string; // orderItemId，同一個 order_item 的多件數量會展開成多個 piece
  amount: number; // 原幣金額（單件不可切割）
  hasDiscountFlag: boolean; // 有滿減標記(v)的商品，金額才算進折扣門檻
}

export interface DiscountTier {
  thresholdAmount: number;
  discountAmount: number;
}

/** 滿贈款式規則，用來估算一組能拿到多少贈品價值 */
export interface GiftValueRule {
  thresholdAmount: number; // 這個款式的門檻金額（原幣）
  perStyleCap: number; // 所選平台對這個款式的每款上限
  valueOriginal: number; // 這個贈品的估值（已換算成原幣）
}

export interface DiscountGroup {
  pieceIds: string[];
  groupAmount: number; // 這組的原幣總金額（含無滿減商品）
  discountableAmount: number; // 這組裡「有滿減標記」的商品金額，折扣門檻只看這個
  discountValue: number;
  giftValue: number; // 這組能拿到的贈品估值總和
  totalValue: number; // discountValue + giftValue
}

/** 找出這個金額符合的最高折扣門檻，回傳對應折扣金額（沒有符合任何門檻則為0） */
function bestDiscountFor(amount: number, tiers: DiscountTier[]): number {
  const matched = tiers.filter((t) => amount >= t.thresholdAmount);
  if (matched.length === 0) return 0;
  return Math.max(...matched.map((t) => t.discountAmount));
}

/**
 * 這一組能拿到多少贈品估值。三層限制跟顧客端 giftQuota.ts 一致：
 *   ① 該組總量上限（廠商單筆上限）
 *   ② 該門檻的名額數 floor(組金額 ÷ 門檻)，同門檻的不同款式共用
 *   ③ 每款上限
 * 為了讓價值最大化，這裡優先配「估值高」的款式。
 */
function giftValueFor(groupAmount: number, giftRules: GiftValueRule[], vendorOrderGiftCap: number): number {
  if (giftRules.length === 0 || vendorOrderGiftCap <= 0) return 0;
  const slotsLeft = new Map<number, number>();
  for (const g of giftRules) {
    if (g.thresholdAmount <= 0) continue;
    if (!slotsLeft.has(g.thresholdAmount)) slotsLeft.set(g.thresholdAmount, Math.floor(groupAmount / g.thresholdAmount));
  }

  let placed = 0;
  let value = 0;
  // 估值高的先配（同樣一個名額，拿貴的贈品比較划算）
  const sorted = [...giftRules].sort((a, b) => b.valueOriginal - a.valueOriginal);
  for (const g of sorted) {
    if (placed >= vendorOrderGiftCap) break;
    if (g.thresholdAmount <= 0) continue;
    const slots = slotsLeft.get(g.thresholdAmount) ?? 0;
    if (slots <= 0) continue;
    const give = Math.min(g.perStyleCap, slots, vendorOrderGiftCap - placed);
    if (give <= 0) continue;
    placed += give;
    value += give * g.valueOriginal;
    slotsLeft.set(g.thresholdAmount, slots - give);
  }
  return value;
}

function makeGroup(
  pieceIds: string[],
  groupAmount: number,
  discountableAmount: number,
  tiers: DiscountTier[],
  giftRules: GiftValueRule[],
  vendorOrderGiftCap: number
): DiscountGroup {
  const discountValue = bestDiscountFor(discountableAmount, tiers);
  const giftValue = giftValueFor(groupAmount, giftRules, vendorOrderGiftCap);
  return { pieceIds, groupAmount, discountableAmount, discountValue, giftValue, totalValue: discountValue + giftValue };
}

/**
 * 產生候選拆法：把商品分成若干組的幾種代表性分法。
 * 貪婪法（一件一件往裡加）看不到「早一點停下來開新組會更好」的情況，
 * 所以改成列舉幾種有意義的拆法，每種都算出「折扣＋贈品價值」總和，選最高的。
 * 這跟顧客端滿贈計算（lib/giftQuota.ts）用的是同一套做法。
 */
function candidatePartitions(pieces: SplitPiece[], tiers: DiscountTier[], giftRules: GiftValueRule[]): SplitPiece[][][] {
  const results: SplitPiece[][][] = [];
  const desc = [...pieces].sort((a, b) => b.amount - a.amount);
  const asc = [...pieces].sort((a, b) => a.amount - b.amount);

  // ① 全部合成一組（適合高門檻折扣特別優惠的情況）
  results.push([desc]);

  // ② 依各個門檻金額連續切割：湊到門檻就開新組。
  //    門檻來源包含折扣門檻與滿贈款式門檻——因為拆組同時影響折扣跟能拿幾個贈品。
  const cutPoints = Array.from(
    new Set([...tiers.map((t) => t.thresholdAmount), ...giftRules.map((g) => g.thresholdAmount)])
  ).filter((t) => t > 0);

  for (const cut of cutPoints) {
    for (const order of [desc, asc]) {
      const groups: SplitPiece[][] = [];
      let cur: SplitPiece[] = [];
      let curAmount = 0;
      for (const p of order) {
        cur.push(p);
        curAmount += p.amount;
        if (curAmount >= cut) {
          groups.push(cur);
          cur = [];
          curAmount = 0;
        }
      }
      if (cur.length > 0) {
        // 剩餘不足門檻的部分：併入最後一組、或自己獨立成一組，兩種都試
        if (groups.length > 0) {
          const merged = groups.map((g, i) => (i === groups.length - 1 ? [...g, ...cur] : g));
          results.push(merged);
        }
        results.push([...groups, cur]);
      } else if (groups.length > 0) {
        results.push(groups);
      }
    }
  }

  // ③ 平均分成 k 組（避免上面兩種都漏掉的中間情況）
  for (let k = 2; k <= Math.min(pieces.length, 20); k++) {
    const buckets: SplitPiece[][] = Array.from({ length: k }, () => []);
    const sums = new Array(k).fill(0);
    for (const p of desc) {
      let minIdx = 0;
      for (let i = 1; i < k; i++) if (sums[i] < sums[minIdx]) minIdx = i;
      buckets[minIdx].push(p);
      sums[minIdx] += p.amount;
    }
    results.push(buckets.filter((b) => b.length > 0));
  }

  return results;
}

function buildGroups(
  partition: SplitPiece[][],
  tiers: DiscountTier[],
  giftRules: GiftValueRule[],
  vendorOrderGiftCap: number
): DiscountGroup[] {
  return partition.map((bucket) => {
    const amount = bucket.reduce((s, p) => s + p.amount, 0);
    const discountable = bucket.reduce((s, p) => s + (p.hasDiscountFlag ? p.amount : 0), 0);
    return makeGroup(bucket.map((p) => p.id), amount, discountable, tiers, giftRules, vendorOrderGiftCap);
  });
}

/**
 * 依「折扣＋贈品價值」總和最大化來分組（3.1節目標函數）。
 * 列舉多種候選拆法，選總價值最高的那一種。
 */
export function splitByDiscountTiers(
  pieces: SplitPiece[],
  tiers: DiscountTier[],
  giftRules: GiftValueRule[] = [],
  vendorOrderGiftCap = 0
): DiscountGroup[] {
  if (pieces.length === 0) return [];

  const partitions = candidatePartitions(pieces, tiers, giftRules);
  let best: DiscountGroup[] = [];
  let bestValue = -Infinity;

  for (const partition of partitions) {
    const groups = buildGroups(partition, tiers, giftRules, vendorOrderGiftCap);
    const value = groups.reduce((s, g) => s + g.totalValue, 0);
    // 價值一樣時，採購單數量少的比較好管理
    if (value > bestValue || (value === bestValue && groups.length < best.length)) {
      bestValue = value;
      best = groups;
    }
  }

  return best;
}
