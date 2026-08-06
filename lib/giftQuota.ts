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

    // 找出「併入這一組」邊際增加配額最多的組。
    // 已經達到廠商單筆上限的組要跳過——再塞東西進去，那些金額完全拿不到額外配額（純浪費），
    // 應該開新組讓後面的金額有機會累積成新的配額。
    // 例：69元x10=690、基礎100、上限5，全部塞成一組只有5個；拆成552+138才是正確的6個。
    let bestGroupIndex = -1;
    let bestMarginalGain = -1;
    groups.forEach((g, idx) => {
      if (g.quota >= vendorOrderGiftCap) return;
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

// ============================================================
// 2.7節：顧客結帳當下，依「已經選了什麼」即時算出每個款式還能選幾個
// ============================================================

export interface GiftStyleRule {
  id: string;
  thresholdAmount: number;
  /** 這個檔期指定平台的「每款上限」——每一張採購單裡，這個款式最多能放幾個 */
  perStyleCap: number;
}

/**
 * 產生候選拆法（把購物車商品拆成幾張採購單）。
 *
 * 完整列舉所有拆法在商品件數一多就會指數爆炸（50件就有20萬種、要0.34秒），
 * 所以這裡只產生「比較有機會拿到最多贈品」的代表性拆法：
 *   ① 每組湊到剛好超過某個門檻就切一組（依各門檻金額切割）
 *   ② 平均分成 k 組（k 從 1 到件數）
 * 這些規律性的拆法涵蓋實務上的最佳解，比隨機取前 N 種準確得多，而且穩定在 1ms 內。
 */
function candidatePartitions(amounts: number[], thresholds: number[]): number[][] {
  const results: number[][] = [];
  const sortedDesc = [...amounts].sort((a, b) => b - a);
  const total = amounts.reduce((s, a) => s + a, 0);

  // 全部合成一組
  results.push([total]);

  // ① 依各門檻金額切割：湊到門檻就切一組。剩餘不足門檻的部分有兩種處理，兩種都要試——
  //    (a) 併入最後一組：讓最後一組金額更大，可能開出更高門檻的名額
  //    (b) 落單成獨立一組：多一組就多一份「每組上限」的空間（例：207+207+207+69 讓門檻200拿到3個）
  for (const t of thresholds) {
    for (const order of [sortedDesc, [...amounts].sort((a, b) => a - b)]) {
      const base: number[] = [];
      let cur = 0;
      for (const amt of order) {
        cur += amt;
        if (cur >= t) {
          base.push(cur);
          cur = 0;
        }
      }
      if (cur > 0) {
        // (a) 併入最後一組
        const merged = [...base];
        if (merged.length > 0) merged[merged.length - 1] += cur;
        else merged.push(cur);
        results.push(merged);
        // (b) 落單成獨立一組
        results.push([...base, cur]);
      } else if (base.length > 0) {
        results.push(base);
      }
    }
  }

  // ② 平均分成 k 組
  for (let k = 2; k <= Math.min(amounts.length, 30); k++) {
    const groups = new Array(k).fill(0);
    for (const amt of sortedDesc) {
      let minIdx = 0;
      for (let i = 1; i < k; i++) if (groups[i] < groups[minIdx]) minIdx = i;
      groups[minIdx] += amt;
    }
    results.push(groups);
  }

  return results;
}

/** 這個拆法下，能不能滿足顧客已經選的組合 */
function canFill(
  groupAmounts: number[],
  vendorOrderGiftCap: number,
  picks: Record<string, number>,
  styles: GiftStyleRule[]
): boolean {
  const remaining: Record<string, number> = {};
  styles.forEach((s) => (remaining[s.id] = picks[s.id] || 0));
  if (Object.values(remaining).every((v) => v <= 0)) return true;

  // 門檻高的先配（比較難滿足）
  const sorted = [...styles].sort((a, b) => b.thresholdAmount - a.thresholdAmount);
  for (const amount of groupAmounts) {
    let groupCount = 0; // 這張採購單已經放了幾個贈品，不能超過廠商單筆上限
    // 每個門檻在這一組能開出幾個名額（同門檻的不同款式共用這批名額）
    const slotsLeft: Record<number, number> = {};
    for (const s of sorted) {
      if (slotsLeft[s.thresholdAmount] === undefined) {
        slotsLeft[s.thresholdAmount] = Math.floor(amount / s.thresholdAmount);
      }
    }
    for (const s of sorted) {
      if (remaining[s.id] <= 0 || groupCount >= vendorOrderGiftCap) continue;
      if (amount < s.thresholdAmount) continue;
      const give = Math.min(
        s.perStyleCap,
        remaining[s.id],
        vendorOrderGiftCap - groupCount,
        slotsLeft[s.thresholdAmount]
      );
      if (give <= 0) continue;
      remaining[s.id] -= give;
      groupCount += give;
      slotsLeft[s.thresholdAmount] -= give;
    }
  }
  return Object.values(remaining).every((v) => v <= 0);
}

/** 這個拆法下，某個款式最多能拿幾個（在已選的基礎上再加） */
function maxForStyle(
  groupAmounts: number[],
  vendorOrderGiftCap: number,
  picks: Record<string, number>,
  styles: GiftStyleRule[],
  target: GiftStyleRule
): number {
  const remaining: Record<string, number> = {};
  styles.forEach((s) => (remaining[s.id] = picks[s.id] || 0));
  const groupUsed = new Array(groupAmounts.length).fill(0);
  const targetUsedPerGroup = new Array(groupAmounts.length).fill(0);
  // 每組每個門檻還剩幾個名額（同門檻的不同款式共用）
  const slotsLeft: Record<number, number>[] = groupAmounts.map((amount) => {
    const m: Record<number, number> = {};
    styles.forEach((s) => {
      if (m[s.thresholdAmount] === undefined) m[s.thresholdAmount] = Math.floor(amount / s.thresholdAmount);
    });
    return m;
  });

  // 先把已選的配置進去（門檻高的優先）
  const sorted = [...styles].sort((a, b) => b.thresholdAmount - a.thresholdAmount);
  for (let gi = 0; gi < groupAmounts.length; gi++) {
    for (const s of sorted) {
      if (remaining[s.id] <= 0 || groupUsed[gi] >= vendorOrderGiftCap) continue;
      if (groupAmounts[gi] < s.thresholdAmount) continue;
      const give = Math.min(
        s.perStyleCap,
        remaining[s.id],
        vendorOrderGiftCap - groupUsed[gi],
        slotsLeft[gi][s.thresholdAmount]
      );
      if (give <= 0) continue;
      remaining[s.id] -= give;
      groupUsed[gi] += give;
      slotsLeft[gi][s.thresholdAmount] -= give;
      if (s.id === target.id) targetUsedPerGroup[gi] += give;
    }
  }
  if (Object.values(remaining).some((v) => v > 0)) return -1; // 這個拆法根本滿足不了已選的

  // 剩下的空間，這個款式還能再放幾個
  // 三層限制取最小：每款上限（扣掉已放的）、該組總量剩餘、該門檻名額剩餘
  let extra = 0;
  const alreadyPicked = picks[target.id] || 0;
  for (let gi = 0; gi < groupAmounts.length; gi++) {
    if (groupAmounts[gi] < target.thresholdAmount) continue;
    const usedByTargetInThisGroup = targetUsedPerGroup[gi] || 0;
    const room = Math.min(
      target.perStyleCap - usedByTargetInThisGroup,
      vendorOrderGiftCap - groupUsed[gi],
      slotsLeft[gi][target.thresholdAmount]
    );
    if (room > 0) extra += room;
  }
  return alreadyPicked + extra;
}

/**
 * 算出每個款式的上限（已選的 + 還能再選的）。
 * 顧客每按一次加減就呼叫一次，用來即時更新畫面、鎖住不能再加的按鈕。
 */
export function computeStyleLimits(
  itemAmounts: number[],
  vendorOrderGiftCap: number,
  picks: Record<string, number>,
  styles: GiftStyleRule[]
): { limits: Record<string, number>; totalPossible: number } {
  const thresholds = Array.from(new Set(styles.map((s) => s.thresholdAmount)));
  const baseUnit = Math.min(...thresholds);

  // 公式A：單件金額大到超過廠商上限時，這一件永遠自成一張採購單（跟別人湊組也拿不到更多），
  // 而且超出的部分是死金額，有效金額被壓成「廠商上限 × 基礎單位」。
  // 例：單價750、上限5、基礎100 → floor(750/100)=7 > 5，有效金額500，門檻300是 floor(500/300)=1 個。
  // 750x3 就是 3 張各自獨立的採購單（各拿5個），不是 2250 合成一張（只拿5個）。
  const overCapAmounts: number[] = [];
  const splittableAmounts: number[] = [];
  for (const amount of itemAmounts) {
    if (Math.floor(amount / baseUnit) > vendorOrderGiftCap) overCapAmounts.push(vendorOrderGiftCap * baseUnit);
    else splittableAmounts.push(amount);
  }

  // 可拆單的商品互相湊組；超上限的每件各自一組，固定加在後面
  const partitions = (splittableAmounts.length > 0 ? candidatePartitions(splittableAmounts, thresholds) : [[]])
    .map((p) => [...p, ...overCapAmounts]);
  const viable = partitions.filter((p) => canFill(p, vendorOrderGiftCap, picks, styles));

  const limits: Record<string, number> = {};
  for (const s of styles) {
    let best = picks[s.id] || 0;
    for (const p of viable) {
      const v = maxForStyle(p, vendorOrderGiftCap, picks, styles, s);
      if (v > best) best = v;
    }
    limits[s.id] = best;
  }

  // 這批商品理論上最多能拿到幾個贈品（給畫面顯示參考）
  // 這批商品理論上最多能拿到幾個贈品（給畫面顯示參考）
  // 每一組（＝一張採購單）能放的贈品數：把該組解鎖的款式逐一放進去，
  // 每款最多 perStyleCap 個，整組不超過廠商單筆上限
  let totalPossible = 0;
  for (const p of partitions) {
    let n = 0;
    for (const amount of p) {
      // 這一組能放的贈品數，同樣受三層限制：
      // ① 該組總量 = min(floor(組金額 ÷ 基礎單位), 廠商上限)
      // ② 該門檻的名額數 = floor(組金額 ÷ 門檻)，同門檻款式共用
      // ③ 每款上限
      const groupCapacity = Math.min(Math.floor(amount / baseUnit), vendorOrderGiftCap);
      const slotsLeft: Record<number, number> = {};
      styles.forEach((s) => {
        if (slotsLeft[s.thresholdAmount] === undefined) slotsLeft[s.thresholdAmount] = Math.floor(amount / s.thresholdAmount);
      });
      let groupCount = 0;
      // 門檻低的先放（低門檻名額多，能塞滿比較多贈品）
      for (const s of [...styles].sort((a, b) => a.thresholdAmount - b.thresholdAmount)) {
        if (groupCount >= groupCapacity) break;
        if (amount < s.thresholdAmount) continue;
        const give = Math.min(s.perStyleCap, groupCapacity - groupCount, slotsLeft[s.thresholdAmount]);
        if (give <= 0) continue;
        groupCount += give;
        slotsLeft[s.thresholdAmount] -= give;
      }
      n += groupCount;
    }
    if (n > totalPossible) totalPossible = n;
  }

  return { limits, totalPossible };
}
