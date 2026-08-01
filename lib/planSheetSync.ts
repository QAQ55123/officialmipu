import { getSupabaseAdmin } from "./supabase";
import {
  getSheets, requireSheetId, requireCostSheetId,
  ensureSheetExistsCached, getValuesAndFormulas, batchGetValues, columnToLetter,
  buildClearRequest, buildWriteRequest, buildBoldRangeRequest, buildHideSheetRequest, buildNumberFormatRequest,
  runBatch, type BatchRequest, type SheetsClient, type SheetMetaCache,
} from "./googleSheets";

const ORDER_HEADER = ["訂單編號", "來源", "暱稱", "FB個人網址", "商品名稱", "款式", "數量", "單價", "小計", "訂單時間", "交易方式", "付款狀態"];
const CATALOG_HEADER = ["商品名稱", "款式", "單價", "圖片"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 2;
  let lastErr: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const isQuotaError = /quota exceeded|resource_exhausted|rate limit/i.test(String(e?.message || ""));
      const delay = isQuotaError ? 65000 : 800;
      if (attempt < maxAttempts - 1) await sleep(delay);
    }
  }
  throw lastErr;
}

function parsePaidAmount(v: any): number {
  const s = String(v == null ? "" : v).trim().replace(/nt\$?/i, "").replace(/[,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type PlanRow = { id: string; name: string; deadline?: string | null };

async function getAllPlans(): Promise<PlanRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("plans").select("id, name, sort_order, deadline");
  // 拖曳排序在後台是「同一個狀態分組（進行中／常駐／已截止）內」各自獨立排序的，
  // 這裡的排序要比照後台畫面的分組邏輯，先分組、組內再依拖曳順序排，
  // 不然兩個不同分組的企劃如果 sort_order 剛好一樣，順序會變得不可預期、跟後台實際看到的對不起來。
  function statusRank(p: { deadline: string | null }) {
    if (!p.deadline) return 1; // 常駐
    return new Date(p.deadline).getTime() < Date.now() ? 2 : 0; // 已截止 : 進行中
  }
  const rows = (data || []) as any[];
  rows.sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    if (r !== 0) return r;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  return rows;
}

async function getPlanProducts(planId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("products").select("*").eq("plan_id", planId).order("sort_order", { ascending: true });
  return data || [];
}

async function getPlanOrders(planId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("orders").select("*, order_items(*)").eq("plan_id", planId).order("created_at", { ascending: true });
  return data || [];
}

function safeTabName(name: string): string {
  return (name || "未命名企劃").replace(/[\\/?*\[\]:]/g, "_").slice(0, 90);
}

async function buildOrderTabRequests(sheets: SheetsClient, mainSheetId: string, planId: string, planName: string, cache: SheetMetaCache): Promise<BatchRequest[]> {
  const tabName = safeTabName(planName);
  const sheetId = await ensureSheetExistsCached(sheets, mainSheetId, tabName, cache);

  const [products, orders] = await Promise.all([getPlanProducts(planId), getPlanOrders(planId)]);

  const catalogRows = products.map((p: any) => [p.name, p.style || "", Number(p.price) || 0, p.image_url || ""]);
  const catalogBlock = [CATALOG_HEADER, ...catalogRows];

  const orderRows: (string | number)[][] = [];
  orders.forEach((o: any) => {
    const paidAmount = Number(o.paid_amount) || 0;
    (o.order_items || []).forEach((it: any) => {
      orderRows.push([
        o.order_no, "", o.username, o.profile_url, it.product_name, it.style || "",
        it.qty, Number(it.unit_price) || 0, Number(it.subtotal) || 0,
        new Date(o.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }), o.payment, paidAmount > 0 ? paidAmount : "",
      ]);
    });
  });

  const fullData: (string | number)[][] = [
    ...catalogBlock,
    ["", "", "", "", "", "", "", "", "", "", "", ""],
    ORDER_HEADER,
    ...orderRows,
  ];

  return [
    buildClearRequest(sheetId, 100000, 12),
    buildWriteRequest(sheetId, 0, 0, fullData),
    buildBoldRangeRequest(sheetId, 0, 1, 0, CATALOG_HEADER.length),
    buildBoldRangeRequest(sheetId, catalogBlock.length + 1, catalogBlock.length + 2, 0, ORDER_HEADER.length),
  ];
}

export async function syncOnePlanOrderTab(planId: string, planName: string) {
  const id = requireSheetId();
  const sheets = await getSheets();
  const requests = await buildOrderTabRequests(sheets, id, planId, planName, new Map());
  await runBatch(sheets, id, requests);
}

export async function syncAllPlanOrderTabs() {
  const id = requireSheetId();
  const sheets = await getSheets();
  const plans = await getAllPlans();
  const failedPlans: string[] = [];
  const allRequests: BatchRequest[] = [];
  const cache: SheetMetaCache = new Map();

  for (const p of plans) {
    try {
      const requests = await buildOrderTabRequests(sheets, id, p.id, p.name, cache);
      allRequests.push(...requests);
    } catch (e: any) {
      failedPlans.push(`${p.name}：${e?.message || "未知錯誤"}`);
    }
  }

  if (allRequests.length > 0) {
    await withRetry(() => runBatch(sheets, id, allRequests));
  }
  if (failedPlans.length > 0) {
    throw new Error(`部分企劃同步失敗（其餘企劃仍已正常同步）：${failedPlans.join("；")}`);
  }
}

export async function syncOrderRealtimeToPlanTab(planId: string, planName: string) {
  await withRetry(() => syncOnePlanOrderTab(planId, planName));
}

type Aggregated = {
  products: { name: string; style: string; price: number }[];
  qty: Record<string, number>;
  customers: { display: string; items: Record<string, number>; paid: number }[];
};

function aggregateFromValues(values: any[][]): Aggregated {
  const products: Aggregated["products"] = [];
  let headerRow = -1;
  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    if (String(row[0] || "").trim() === ORDER_HEADER[0]) { headerRow = i; break; }
    if (i > 0 && String(row[0] || "").trim()) {
      products.push({ name: String(row[0]).trim(), style: String(row[1] || "").trim(), price: Number(row[2]) || 0 });
    }
  }

  const qty: Record<string, number> = {};
  const customersMap = new Map<string, { display: string; items: Record<string, number>; paid: number }>();
  const paidSeenOrderNo = new Set<string>();

  if (headerRow >= 0) {
    for (let i = headerRow + 1; i < values.length; i++) {
      const r = values[i] || [];
      const name = String(r[4] || "").trim();
      if (!name) continue;
      const style = String(r[5] || "").trim();
      const q = Number(r[6]) || 0;
      const key = `${name}|${style}`;
      qty[key] = (qty[key] || 0) + q;

      const username = String(r[2] || "").trim();
      if (!customersMap.has(username)) customersMap.set(username, { display: username, items: {}, paid: 0 });
      const c = customersMap.get(username)!;
      c.items[key] = (c.items[key] || 0) + q;

      const orderNo = String(r[0] || "").trim();
      if (orderNo && !paidSeenOrderNo.has(orderNo)) {
        paidSeenOrderNo.add(orderNo);
        c.paid += parsePaidAmount(r[11]);
      }
    }
  }

  return { products, qty, customers: Array.from(customersMap.values()) };
}

async function aggregatePlanFromSheet(sheets: SheetsClient, id: string, tabName: string): Promise<Aggregated> {
  const { values } = await getValuesAndFormulas(sheets, id, `${tabName}!A1:L100000`);
  return aggregateFromValues(values);
}

const LABELS = ["商品", "款式", "售價", "進貨單價", "單件重量(g)", "數量", "小計", "", "【運費計算】", "包裹總重(g)", "每公斤價格", "內陸運費", "商品總重(g)", "包材重量(g)", "每g分攤比例", "【總覽】", "總收入", "總進貨成本", "其他", "淨利潤", "【客戶應收運費】", "客戶"];

async function buildCostTabRequests(
  sheets: SheetsClient,
  costId: string,
  planTab: string,
  agg: Aggregated,
  oldValues: any[][],
  oldFormulas: any[][],
  cache: SheetMetaCache
): Promise<{ requests: BatchRequest[]; custStartRow: number; custCount: number }> {
  const sheetId = await ensureSheetExistsCached(sheets, costId, planTab, cache);
  const products = agg.products;
  const N = products.length;

  const manual = new Map<string, { buy: any; weightWrite: any }>();
  let pkgTotal: any = "", kgPrice: any = "", landFee: any = "", otherVal: any = "";
  oldValues.forEach((v, i) => {
    const a = String(v[0] || "").trim();
    const cell = (c: number) => (oldFormulas[i]?.[c] ? oldFormulas[i][c] : v[c]);
    if (a === "包裹總重(g)") { pkgTotal = cell(2); return; }
    if (a === "每公斤價格") { kgPrice = cell(2); return; }
    if (a === "內陸運費") { landFee = cell(2); return; }
    if (a === "其他") { otherVal = cell(2); return; }
    if (a && LABELS.indexOf(a) === -1) {
      manual.set(`${a}|${String(v[1] || "").trim()}`, { buy: cell(3), weightWrite: cell(4) });
    }
  });

  const data: (string | number)[][] = [];
  data.push(["商品", "款式", "售價", "進貨單價", "單件重量(g)", "數量", "小計"]);
  products.forEach((p, i) => {
    const row = 2 + i;
    const m = manual.get(`${p.name}|${p.style}`) || ({} as any);
    const qty = agg.qty[`${p.name}|${p.style}`] || 0;
    data.push([
      p.name, p.style, p.price,
      m.buy !== undefined && m.buy !== "" ? m.buy : "",
      m.weightWrite !== undefined && m.weightWrite !== "" ? m.weightWrite : "",
      qty,
      `=IF(D${row}="","",D${row}*F${row})`,
    ]);
  });
  const lastP = N + 1;
  data.push(["", "", "", "", "", "", ""]);

  const pkgRow = N + 4, prodWRow = N + 7, pkgMatRow = N + 8;
  data.push(["【運費計算】", "", "", "", "", "", ""]);
  data.push(["包裹總重(g)", "", pkgTotal, "", "", "", ""]);
  data.push(["每公斤價格", "", kgPrice, "", "", "", ""]);
  data.push(["內陸運費", "", landFee, "", "", "", ""]);
  data.push(["商品總重(g)", "", `=SUMPRODUCT((E2:E${lastP}<>"")*E2:E${lastP}*F2:F${lastP})`, "", "", "", ""]);
  data.push(["包材重量(g)", "", `=IF(C${pkgRow}="","",C${pkgRow}-C${prodWRow})`, "", "", "", ""]);
  data.push(["每g分攤比例", "", `=IF(C${prodWRow}=0,"",C${pkgMatRow}/C${prodWRow})`, "", "", "", ""]);
  data.push(["", "", "", "", "", "", ""]);

  const incomeRow = N + 12, costRow = N + 13, otherRow = N + 14;
  const kgRow = N + 5, ratioRow = N + 9, landRow = N + 6;
  data.push(["【總覽】", "", "", "", "", "", ""]);
  data.push(["總收入", "", `=SUMPRODUCT((C2:C${lastP}<>"")*C2:C${lastP}*F2:F${lastP})`, "", "", "", ""]);
  data.push(["總進貨成本", "", `=SUMPRODUCT((D2:D${lastP}<>"")*D2:D${lastP}*F2:F${lastP})`, "", "", "", ""]);
  data.push(["其他", "", otherVal, "", "", "", ""]);
  data.push(["淨利潤", "", `=IF(C${incomeRow}="","",C${incomeRow}-C${costRow}+IF(C${otherRow}="",0,C${otherRow}))`, "", "", "", ""]);

  const customers = (agg.customers || []).slice().sort((a, b) => (a.display < b.display ? -1 : 1));
  const nCust = customers.length;
  const detailName = `_${planTab}_明細`;
  const detailRef = `'${detailName.replace(/'/g, "''")}'!`;
  const detailSheetId = await ensureSheetExistsCached(sheets, costId, detailName, cache);
  const ddata: (string | number)[][] = [["商品", "款式", ...customers.map((c) => c.display)]];
  products.forEach((p) => {
    const rowArr: (string | number)[] = [p.name, p.style];
    customers.forEach((c) => rowArr.push(Number(c.items[`${p.name}|${p.style}`]) || 0));
    ddata.push(rowArr);
  });

  data.push(["", "", "", "", "", "", ""]);
  data.push(["【客戶應收運費】", "", "", "", "", "", ""]);
  data.push(["客戶", "應收運費", "商品小計", "應收總額", "已收", "尚欠", ""]);
  const custStartRow = N + 19;
  customers.forEach((c, i) => {
    const row = custStartRow + i;
    const col = columnToLetter(3 + i);
    const wSum = `SUMPRODUCT($E$2:$E$${lastP},${detailRef}${col}2:${col}${lastP})`;
    const ratioMul = `(1+IF($C$${ratioRow}="",0,$C$${ratioRow}))`;
    const landShare = `IF($C$${landRow}="",0,$C$${landRow}/${nCust})`;
    const feeF = `=CEILING(IF($C$${kgRow}="",0,(${wSum})*${ratioMul}*$C$${kgRow}/1000)+${landShare},1)`;
    const subtotalF = `=SUMPRODUCT($C$2:$C$${lastP},${detailRef}${col}2:${col}${lastP})`;
    data.push([c.display, feeF, subtotalF, `=B${row}+C${row}`, Number(c.paid) || 0, `=D${row}-E${row}`, ""]);
  });

  return {
    requests: [
      buildClearRequest(sheetId, 100000, 7),
      buildWriteRequest(sheetId, 0, 0, data),
      buildBoldRangeRequest(sheetId, 0, 1, 0, 7),
      buildBoldRangeRequest(sheetId, N + 16, N + 18, 0, 7),
      buildClearRequest(detailSheetId, 100000, 26),
      buildWriteRequest(detailSheetId, 0, 0, ddata),
      buildHideSheetRequest(detailSheetId, true),
    ],
    custStartRow,
    custCount: customers.length,
  };
}

function buildCostSummaryRequests(
  sheetId: number,
  rows: { name: string; tab: string; incomeRow: number; costRow: number; profitRow: number; custStartRow: number; custCount: number }[]
): BatchRequest[] {
  const data: (string | number)[][] = [["企劃", "銷售(收入)", "進貨成本", "淨利潤", "已收款金額", "未收款金額", "淨利潤率"]];
  rows.forEach((r, i) => {
    const row = i + 2;
    const ref = `'${r.tab.replace(/'/g, "''")}'!`;
    const custEndRow = r.custStartRow + r.custCount - 1;
    const paidF = r.custCount > 0 ? `=SUM(${ref}E${r.custStartRow}:E${custEndRow})` : 0;
    const owingF = r.custCount > 0 ? `=SUM(${ref}F${r.custStartRow}:F${custEndRow})` : 0;
    const marginF = `=IF(B${row}=0,"",D${row}/B${row})`;
    data.push([r.name, `=${ref}C${r.incomeRow}`, `=${ref}C${r.costRow}`, `=${ref}C${r.profitRow}`, paidF, owingF, marginF]);
  });
  const n = rows.length;
  const requests: BatchRequest[] = [
    buildClearRequest(sheetId, 100000, 7),
    buildWriteRequest(sheetId, 0, 0, data),
    buildBoldRangeRequest(sheetId, 0, 1, 0, 7),
    buildNumberFormatRequest(sheetId, 1, n + 1, 6, 7, "0.0%"),
  ];
  if (n > 0) {
    const first = 2, last = 1 + n;
    const totalRow = n + 3; // 中間空一列，合計往下移一列
    data.push(["", "", "", "", "", "", ""]); // 空白分隔列
    data.push(["合計", `=SUM(B${first}:B${last})`, `=SUM(C${first}:C${last})`, `=SUM(D${first}:D${last})`, `=SUM(E${first}:E${last})`, `=SUM(F${first}:F${last})`, `=IF(B${totalRow}=0,"",D${totalRow}/B${totalRow})`]);
    requests[1] = buildWriteRequest(sheetId, 0, 0, data); // 重新組含空白列+合計的完整內容
    requests.push(buildBoldRangeRequest(sheetId, totalRow - 1, totalRow, 0, 7));
    requests.push(buildNumberFormatRequest(sheetId, totalRow - 1, totalRow, 6, 7, "0.0%"));
  }
  return requests;
}

export async function syncOnePlanCostTab(planId: string, planName: string) {
  const costId = requireCostSheetId();
  const tabName = safeTabName(planName);
  await withRetry(async () => {
    const sheets = await getSheets();
    const agg = await aggregatePlanFromSheet(sheets, requireSheetId(), tabName);
    if (agg.products.length === 0) return;

    const cache: SheetMetaCache = new Map();
    const { values: oldValues, formulas: oldFormulas } = await getValuesAndFormulas(sheets, costId, `${tabName}!A1:G100000`);
    const { requests: costRequests, custStartRow, custCount } = await buildCostTabRequests(sheets, costId, tabName, agg, oldValues, oldFormulas, cache);

    const summarySheetId = await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
    const { values, formulas } = await getValuesAndFormulas(sheets, costId, `總覽!A1:G100000`);
    const N = agg.products.length;
    const incomeRow = N + 12, costRow = N + 13, profitRow = N + 15;

    // 其他企劃那幾列的內容照抄（要抄「公式」不是抄計算後的值，不然其他企劃的數字會被寫死、不再跟著資料庫變動）；
    // 只有自己這一列要用剛剛算好的最新資料取代掉（找不到就加在最後面）。
    // 注意：B/C/D/E/F 欄的公式是參照「別的分頁」，複製過來不會受列位置影響，可以放心照抄；
    // 但 G 欄（淨利潤率）是參照「自己這一列」的 B、D 欄，如果列的位置跟之前不一樣（例如企劃順序變動），
    // 照抄舊公式會抓錯列，所以 G 欄一定要依最終實際的列位置重新產生，不能照抄。
    const otherRows = values
      .slice(1)
      .map((v, i) => {
        const f = formulas[i + 1] || [];
        return [0, 1, 2, 3, 4, 5].map((ci) => (f[ci] ? f[ci] : v[ci] ?? ""));
      })
      .filter((r) => String(r[0] || "").trim() && String(r[0] || "").trim() !== "合計" && String(r[0] || "").trim() !== planName);

    const ref = `'${tabName.replace(/'/g, "''")}'!`;
    const custEndRow = custStartRow + custCount - 1;
    const paidF = custCount > 0 ? `=SUM(${ref}E${custStartRow}:E${custEndRow})` : 0;
    const owingF = custCount > 0 ? `=SUM(${ref}F${custStartRow}:F${custEndRow})` : 0;
    const selfRow: (string | number)[] = [
      planName, `=${ref}C${incomeRow}`, `=${ref}C${costRow}`, `=${ref}C${profitRow}`, paidF, owingF,
    ];
    const dataRows: (string | number)[][] = [...otherRows, selfRow].map((r, i) => {
      const row = i + 2;
      return [...r, `=IF(B${row}=0,"",D${row}/B${row})`];
    });

    const finalData: (string | number)[][] = [["企劃", "銷售(收入)", "進貨成本", "淨利潤", "已收款金額", "未收款金額", "淨利潤率"], ...dataRows];
    const n = dataRows.length;
    const summaryRequests: BatchRequest[] = [
      buildClearRequest(summarySheetId, 100000, 7),
      buildBoldRangeRequest(summarySheetId, 0, 1, 0, 7),
      buildNumberFormatRequest(summarySheetId, 1, n + 1, 6, 7, "0.0%"),
    ];
    if (n > 0) {
      const first = 2, last = 1 + n;
      const totalRow = n + 3;
      finalData.push(["", "", "", "", "", "", ""]);
      finalData.push(["合計", `=SUM(B${first}:B${last})`, `=SUM(C${first}:C${last})`, `=SUM(D${first}:D${last})`, `=SUM(E${first}:E${last})`, `=SUM(F${first}:F${last})`, `=IF(B${totalRow}=0,"",D${totalRow}/B${totalRow})`]);
      summaryRequests.push(buildBoldRangeRequest(summarySheetId, totalRow - 1, totalRow, 0, 7));
      summaryRequests.push(buildNumberFormatRequest(summarySheetId, totalRow - 1, totalRow, 6, 7, "0.0%"));
    }
    summaryRequests.splice(1, 0, buildWriteRequest(summarySheetId, 0, 0, finalData));

    await runBatch(sheets, costId, [...costRequests, ...summaryRequests]);
  });
}

export async function syncCostWorkbook() {
  const costId = requireCostSheetId();
  const mainId = requireSheetId();
  const sheets = await getSheets();
  const plans = await getAllPlans();
  const cache: SheetMetaCache = new Map();

  const mainTabNames = plans.map((p) => safeTabName(p.name));
  if (mainTabNames.length > 0) {
    await ensureSheetExistsCached(sheets, mainId, mainTabNames[0], cache).catch(() => {});
  }
  const mainMeta = cache.get(mainId);
  const existingMainTabs = new Set(mainTabNames.filter((t) => mainMeta?.has(t)));
  const mainRanges = mainTabNames.filter((t) => existingMainTabs.has(t)).map((t) => `${t}!A1:L100000`);
  const mainValuesMap = mainRanges.length > 0 ? await batchGetValues(sheets, mainId, mainRanges) : {};

  await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
  const costMeta = cache.get(costId);
  const costTabNames = plans.map((p) => safeTabName(p.name));
  const existingCostTabs = new Set(costTabNames.filter((t) => costMeta?.has(t)));
  const costRanges = costTabNames.filter((t) => existingCostTabs.has(t)).map((t) => `${t}!A1:G100000`);
  const [costValuesMap, costFormulasMap] = costRanges.length > 0
    ? await Promise.all([
        batchGetValues(sheets, costId, costRanges),
        batchGetValues(sheets, costId, costRanges, "FORMULA"),
      ])
    : [{}, {}];

  const summaryRows: { name: string; tab: string; incomeRow: number; costRow: number; profitRow: number; custStartRow: number; custCount: number }[] = [];
  const failedPlans: string[] = [];
  const allRequests: BatchRequest[] = [];

  for (const p of plans) {
    try {
      const tabName = safeTabName(p.name);
      const mainValues = mainValuesMap[`${tabName}!A1:L100000`] || [];
      const agg = aggregateFromValues(mainValues);
      if (agg.products.length === 0) continue;

      const oldValues = costValuesMap[`${tabName}!A1:G100000`] || [];
      const oldFormulas = costFormulasMap[`${tabName}!A1:G100000`] || [];
      const { requests, custStartRow, custCount } = await buildCostTabRequests(sheets, costId, tabName, agg, oldValues, oldFormulas, cache);
      allRequests.push(...requests);
      const N = agg.products.length;
      summaryRows.push({ name: p.name, tab: tabName, incomeRow: N + 12, costRow: N + 13, profitRow: N + 15, custStartRow, custCount });
    } catch (e: any) {
      failedPlans.push(`${p.name}：${e?.message || "未知錯誤"}`);
    }
  }

  const summarySheetId = await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
  allRequests.push(...buildCostSummaryRequests(summarySheetId, summaryRows));

  if (allRequests.length > 0) {
    await withRetry(() => runBatch(sheets, costId, allRequests));
  }
  if (failedPlans.length > 0) {
    throw new Error(`部分企劃成本表同步失敗（其餘企劃仍已正常同步）：${failedPlans.join("；")}`);
  }
}
