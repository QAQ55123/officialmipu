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

// ─────────────────────────────────────────────────────────────────────────────
// 精確分配：判斷「這些滿贈放不放得進這幾張採購單」
//
// 舊做法是一張單一張單依序塞（門檻高的先），不會回頭重排，遇到「每款每單限 1 個」
// 時常會誤判放不下（例：徽章選 2 個必須兩張單各放一個，但第一張單的門檻名額先被別款佔走），
// 結果顧客看到「可選 10 / 11」卻怎麼選都加不上去、送不出訂單。
//
// 現在改用最大流（網路流）一次把所有已選款式同時分配，只要存在任何一種放法就一定找得到。
// 網路：起點 → 款式（顧客選的數量）→ 每張單的各門檻名額（每款每單上限）
//       → 每張單（同門檻名額數 floor(單金額 ÷ 門檻)）→ 終點（每單總量 min(floor(單金額 ÷ 基礎單位), 廠商上限)）
// ─────────────────────────────────────────────────────────────────────────────

const BIG = 1e9;

class FlowNet {
  private head: number[] = [];
  private to: number[] = [];
  private cap: number[] = [];
  private next: number[] = [];
  nodeCount = 0;

  addNode(): number {
    this.head.push(-1);
    return this.nodeCount++;
  }

  /** 回傳這條邊的編號，之後可以調整容量 */
  addEdge(u: number, v: number, c: number): number {
    const id = this.to.length;
    this.to.push(v); this.cap.push(c); this.next.push(this.head[u]); this.head[u] = id;
    this.to.push(u); this.cap.push(0); this.next.push(this.head[v]); this.head[v] = id + 1;
    return id;
  }

  addCap(edgeId: number, extra: number) {
    this.cap[edgeId] += extra;
  }

  /** Edmonds–Karp：從目前的殘餘網路繼續增廣，回傳這次增加的流量 */
  augment(s: number, t: number): number {
    let total = 0;
    for (;;) {
      const prevEdge = new Array(this.nodeCount).fill(-1);
      const seen = new Array(this.nodeCount).fill(false);
      seen[s] = true;
      const queue = [s];
      for (let qi = 0; qi < queue.length && !seen[t]; qi++) {
        const u = queue[qi];
        for (let e = this.head[u]; e !== -1; e = this.next[e]) {
          const v = this.to[e];
          if (!seen[v] && this.cap[e] > 0) {
            seen[v] = true;
            prevEdge[v] = e;
            queue.push(v);
          }
        }
      }
      if (!seen[t]) return total;
      let f = Infinity;
      for (let v = t; v !== s; v = this.to[prevEdge[v] ^ 1]) f = Math.min(f, this.cap[prevEdge[v]]);
      for (let v = t; v !== s; v = this.to[prevEdge[v] ^ 1]) {
        this.cap[prevEdge[v]] -= f;
        this.cap[prevEdge[v] ^ 1] += f;
      }
      total += f;
    }
  }
}

/** 建立某一種拆法（每張單的金額）的分配網路；sourceCap 是每個款式從起點流出的上限 */
function buildAssignment(
  groupAmounts: number[],
  vendorOrderGiftCap: number,
  baseUnit: number,
  styles: GiftStyleRule[],
  sourceCap: (s: GiftStyleRule) => number
) {
  const net = new FlowNet();
  const S = net.addNode();
  const T = net.addNode();
  const styleEdge: Record<string, number> = {};
  const styleNode: Record<string, number> = {};
  styles.forEach((s) => {
    styleNode[s.id] = net.addNode();
    styleEdge[s.id] = net.addEdge(S, styleNode[s.id], Math.max(0, sourceCap(s)));
  });
  const thresholds = Array.from(new Set(styles.map((s) => s.thresholdAmount)));
  groupAmounts.forEach((amount) => {
    const groupCapacity = Math.min(Math.floor(amount / baseUnit), vendorOrderGiftCap);
    if (groupCapacity <= 0) return;
    const g = net.addNode();
    net.addEdge(g, T, groupCapacity);
    thresholds.forEach((t) => {
      if (amount < t) return;
      const slot = net.addNode();
      net.addEdge(slot, g, Math.floor(amount / t)); // 同門檻的不同款式共用這批名額
      styles.forEach((s) => {
        if (s.thresholdAmount === t) net.addEdge(styleNode[s.id], slot, s.perStyleCap); // 每款每單上限
      });
    });
  });
  return { net, S, T, styleEdge };
}

function sumPicks(picks: Record<string, number>, styles: GiftStyleRule[]): number {
  return styles.reduce((sum, s) => sum + Math.max(0, Number(picks[s.id]) || 0), 0);
}

/** 這種拆法放不放得下目前選的全部滿贈 */
function canFillExact(groupAmounts: number[], cap: number, baseUnit: number, picks: Record<string, number>, styles: GiftStyleRule[]): boolean {
  const need = sumPicks(picks, styles);
  if (need <= 0) return true;
  const { net, S, T } = buildAssignment(groupAmounts, cap, baseUnit, styles, (s) => Number(picks[s.id]) || 0);
  return net.augment(S, T) >= need;
}

/** 在放得下目前選擇的前提下，某個款式最多能拿幾個（含已選的）；放不下回傳 -1 */
function maxForStyleExact(groupAmounts: number[], cap: number, baseUnit: number, picks: Record<string, number>, styles: GiftStyleRule[], target: GiftStyleRule): number {
  const need = sumPicks(picks, styles);
  const { net, S, T, styleEdge } = buildAssignment(groupAmounts, cap, baseUnit, styles, (s) => Number(picks[s.id]) || 0);
  if (net.augment(S, T) < need) return -1;
  // 其他款式的流量已經滿了，再把這個款式的起點放寬，繼續增廣多出來的就是它還能再拿的數量
  net.addCap(styleEdge[target.id], BIG);
  const extra = net.augment(S, T);
  return (Number(picks[target.id]) || 0) + extra;
}

/** 這種拆法最多能放幾個滿贈（不限款式怎麼選） */
function maxTotalExact(groupAmounts: number[], cap: number, baseUnit: number, styles: GiftStyleRule[]): number {
  const { net, S, T } = buildAssignment(groupAmounts, cap, baseUnit, styles, () => BIG);
  return net.augment(S, T);
}

/** 依顧客結帳同一套規則產生代表性拆法：單件超過廠商上限的自成一單，其他的互相湊組（去掉重複的拆法） */
function partitionsFor(itemAmounts: number[], vendorOrderGiftCap: number, styles: GiftStyleRule[]): { partitions: number[][]; baseUnit: number } {
  const thresholds = Array.from(new Set(styles.map((s) => s.thresholdAmount)));
  const baseUnit = Math.min(...thresholds);
  // 公式A：單件金額大到超過廠商上限時，這一件永遠自成一張採購單（跟別人湊組也拿不到更多），
  // 而且超出的部分是死金額，有效金額被壓成「廠商上限 × 基礎單位」。
  // 例：單價750、上限5、基礎100 → floor(750/100)=7 > 5，有效金額500，門檻300是 floor(500/300)=1 個。
  const overCapAmounts: number[] = [];
  const splittableAmounts: number[] = [];
  for (const amount of itemAmounts) {
    if (Math.floor(amount / baseUnit) > vendorOrderGiftCap) overCapAmounts.push(vendorOrderGiftCap * baseUnit);
    else splittableAmounts.push(amount);
  }
  const raw = (splittableAmounts.length > 0 ? candidatePartitions(splittableAmounts, thresholds) : [[]]).map((p) => [...p, ...overCapAmounts]);
  const seen = new Set<string>();
  const partitions: number[][] = [];
  for (const p of raw) {
    const key = [...p].sort((a, b) => b - a).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    partitions.push(p);
  }
  return { partitions, baseUnit };
}

/**
 * 算出每個款式的上限（已選的 + 還能再選的）。
 * 顧客每按一次加減就呼叫一次，用來即時更新畫面、鎖住不能再加的按鈕。
 * totalPossible：這批商品理論上最多能拿到幾個贈品（「可選 x / y 個」的 y）。
 * 兩者用同一套精確分配計算，保證「只要總數還沒滿，就一定有某一款能再加」。
 */
export function computeStyleLimits(
  itemAmounts: number[],
  vendorOrderGiftCap: number,
  picks: Record<string, number>,
  styles: GiftStyleRule[]
): { limits: Record<string, number>; totalPossible: number } {
  const limits: Record<string, number> = {};
  if (styles.length === 0 || itemAmounts.length === 0) {
    styles.forEach((s) => (limits[s.id] = Number(picks[s.id]) || 0));
    return { limits, totalPossible: 0 };
  }
  const { partitions, baseUnit } = partitionsFor(itemAmounts, vendorOrderGiftCap, styles);
  const viable = partitions.filter((p) => canFillExact(p, vendorOrderGiftCap, baseUnit, picks, styles));

  for (const s of styles) {
    let best = Number(picks[s.id]) || 0;
    for (const p of viable) {
      const v = maxForStyleExact(p, vendorOrderGiftCap, baseUnit, picks, styles, s);
      if (v > best) best = v;
    }
    limits[s.id] = best;
  }

  let totalPossible = 0;
  for (const p of partitions) {
    const n = maxTotalExact(p, vendorOrderGiftCap, baseUnit, styles);
    if (n > totalPossible) totalPossible = n;
  }
  return { limits, totalPossible };
}

/**
 * 這組滿贈選擇在這批商品金額下「拿不拿得到」——跟顧客結帳時同一套拆法與精確分配：
 * 只要有任何一種代表性拆單方式能把每個款式的數量都配齊，就算可以。
 * 後台編輯訂單滿贈、編輯訂單商品時用來擋超過上限的情況。
 */
export function picksFeasible(
  itemAmounts: number[],
  vendorOrderGiftCap: number,
  picks: Record<string, number>,
  styles: GiftStyleRule[]
): boolean {
  if (sumPicks(picks, styles) <= 0) return true;
  // 選了不在這個檔期的款式
  const ids = new Set(styles.map((s) => s.id));
  if (Object.entries(picks).some(([id, q]) => (Number(q) || 0) > 0 && !ids.has(id))) return false;
  if (itemAmounts.length === 0 || styles.length === 0) return false;
  const { partitions, baseUnit } = partitionsFor(itemAmounts, vendorOrderGiftCap, styles);
  return partitions.some((p) => canFillExact(p, vendorOrderGiftCap, baseUnit, picks, styles));
}
