import { getSupabaseAdmin } from "./supabase";
import {
  getSheets, requireSheetId, requireCostSheetId,
  ensureSheetExistsCached, getValuesAndFormulas, batchGetValues, columnToLetter,
  buildClearRequest, buildWriteRequest, buildBoldRangeRequest, buildHideSheetRequest, buildNumberFormatRequest, buildUnhideColumnsRequest,
  runBatch, type BatchRequest, type SheetsClient, type SheetMetaCache,
} from "./googleSheets";

// 一次結帳＝一張訂單、可跨系列，所以要標系列才分得出來是哪個系列的商品
const ORDER_HEADER = ["訂單編號", "來源", "暱稱", "FB個人網址", "系列", "商品名稱", "款式", "數量", "單價", "小計", "訂單時間", "交易方式", "付款狀態"];

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

type CampaignRow = { id: string; name: string };

/** item 7：容器從企劃改成檔期，一個檔期一份分頁，依開放起始時間排序（不再有「進行中／常駐／已截止」分組） */
async function getAllCampaigns(): Promise<CampaignRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("campaigns").select("id, name, sort_order").order("sort_order", { ascending: true });
  return (data || []) as any[];
}

async function getCampaignOrders(campaignId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("orders").select("*, order_items(*)").eq("campaign_id", campaignId).order("created_at", { ascending: true });
  return data || [];
}

function safeTabName(name: string): string {
  return (name || "未命名檔期").replace(/[\\/?*\[\]:]/g, "_").slice(0, 90);
}

/**
 * item 7：這個檔期底下實際用到哪些商品／金額，從訂單品項推導（不是查資料庫商品表，因為商品現在跟檔期完全無關，
 * 沒有「這個檔期的商品」這種東西）。價目表區塊依你確認的做法：資料還是寫進 Sheet，只是欄位設成隱藏，
 * 程式邏輯（包含下面成本表要回頭讀這個區塊）完全不用改。
 */
async function buildOrderTabRequests(sheets: SheetsClient, mainSheetId: string, campaignId: string, campaignName: string, cache: SheetMetaCache): Promise<BatchRequest[]> {
  const tabName = safeTabName(campaignName);
  const sheetId = await ensureSheetExistsCached(sheets, mainSheetId, tabName, cache);

  const orders = await getCampaignOrders(campaignId);

  // 從訂單品項推導出這個檔期實際用到的商品目錄（同名同款式只留一筆，金額用最後出現的那筆）
  const orderRows: (string | number)[][] = [];
  orders.forEach((o: any) => {
    const paidAmount = Number(o.paid_amount) || 0;
    (o.order_items || []).forEach((it: any) => {
      orderRows.push([
        o.order_no, "", o.username, o.profile_url,
        it.series_name_snapshot || o.series_name_snapshot || "",
        it.product_name, it.style || "",
        it.qty, Number(it.unit_price) || 0, Number(it.subtotal) || 0,
        new Date(o.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }), o.payment, paidAmount > 0 ? paidAmount : "",
      ]);
    });
  });

  // 打開分頁就要直接看到訂單，不再在上面放價目表區塊（也就不需要隱藏欄位了）
  const fullData: (string | number)[][] = [ORDER_HEADER, ...orderRows];

  return [
    // 舊版本曾經把價目表區塊（A~D欄）設成隱藏，屬性會留在試算表上，這裡主動設回顯示
    buildUnhideColumnsRequest(sheetId, 0, 26),
    buildClearRequest(sheetId, 100000, ORDER_HEADER.length),
    buildWriteRequest(sheetId, 0, 0, fullData),
    buildBoldRangeRequest(sheetId, 0, 1, 0, ORDER_HEADER.length),
  ];
}

export async function syncOneCampaignOrderTab(campaignId: string, campaignName: string) {
  const id = requireSheetId();
  const sheets = await getSheets();
  const requests = await buildOrderTabRequests(sheets, id, campaignId, campaignName, new Map());
  await runBatch(sheets, id, requests);
}

export async function syncAllCampaignOrderTabs() {
  const id = requireSheetId();
  const sheets = await getSheets();
  const campaigns = await getAllCampaigns();
  const failed: string[] = [];
  const allRequests: BatchRequest[] = [];
  const cache: SheetMetaCache = new Map();

  for (const c of campaigns) {
    try {
      const requests = await buildOrderTabRequests(sheets, id, c.id, c.name, cache);
      allRequests.push(...requests);
    } catch (e: any) {
      failed.push(`${c.name}：${e?.message || "未知錯誤"}`);
    }
  }

  if (allRequests.length > 0) {
    await withRetry(() => runBatch(sheets, id, allRequests));
  }
  if (failed.length > 0) {
    throw new Error(`部分檔期同步失敗（其餘檔期仍已正常同步）：${failed.join("；")}`);
  }
}

export async function syncOrderRealtimeToPlanTab(campaignId: string, campaignName: string) {
  await withRetry(() => syncOneCampaignOrderTab(campaignId, campaignName));
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

async function aggregateCampaignFromSheet(sheets: SheetsClient, id: string, tabName: string): Promise<Aggregated> {
  const { values } = await getValuesAndFormulas(sheets, id, `${tabName}!A1:L100000`);
  return aggregateFromValues(values);
}

const LABELS = ["商品", "款式", "售價", "進貨單價", "單件重量(g)", "數量", "小計", "", "【運費計算】", "包裹總重(g)", "每公斤價格", "內陸運費", "商品總重(g)", "包材重量(g)", "每g分攤比例", "【總覽】", "總收入", "總進貨成本", "其他", "淨利潤", "【客戶應收運費】", "客戶"];

async function buildCostTabRequests(
  sheets: SheetsClient,
  costId: string,
  campaignTab: string,
  agg: Aggregated,
  oldValues: any[][],
  oldFormulas: any[][],
  cache: SheetMetaCache
): Promise<{ requests: BatchRequest[]; custStartRow: number; custCount: number }> {
  const sheetId = await ensureSheetExistsCached(sheets, costId, campaignTab, cache);
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
  const detailName = `_${campaignTab}_明細`;
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
  const data: (string | number)[][] = [["檔期", "銷售(收入)", "進貨成本", "淨利潤", "已收款金額", "未收款金額", "淨利潤率"]];
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
    const totalRow = n + 3;
    data.push(["", "", "", "", "", "", ""]);
    data.push(["合計", `=SUM(B${first}:B${last})`, `=SUM(C${first}:C${last})`, `=SUM(D${first}:D${last})`, `=SUM(E${first}:E${last})`, `=SUM(F${first}:F${last})`, `=IF(B${totalRow}=0,"",D${totalRow}/B${totalRow})`]);
    requests[1] = buildWriteRequest(sheetId, 0, 0, data);
    requests.push(buildBoldRangeRequest(sheetId, totalRow - 1, totalRow, 0, 7));
    requests.push(buildNumberFormatRequest(sheetId, totalRow - 1, totalRow, 6, 7, "0.0%"));
  }
  return requests;
}

export async function syncOnePlanCostTab(campaignId: string, campaignName: string) {
  const costId = requireCostSheetId();
  const tabName = safeTabName(campaignName);
  await withRetry(async () => {
    const sheets = await getSheets();
    const agg = await aggregateCampaignFromSheet(sheets, requireSheetId(), tabName);
    if (agg.products.length === 0) return;

    const cache: SheetMetaCache = new Map();
    const { values: oldValues, formulas: oldFormulas } = await getValuesAndFormulas(sheets, costId, `${tabName}!A1:G100000`);
    const { requests: costRequests, custStartRow, custCount } = await buildCostTabRequests(sheets, costId, tabName, agg, oldValues, oldFormulas, cache);

    const summarySheetId = await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
    const { values, formulas } = await getValuesAndFormulas(sheets, costId, `總覽!A1:G100000`);
    const N = agg.products.length;
    const incomeRow = N + 12, costRow = N + 13, profitRow = N + 15;

    // 其他檔期那幾列的內容照抄（要抄「公式」不是抄計算後的值，不然其他檔期的數字會被寫死、不再跟著資料庫變動）；
    // 只有自己這一列要用剛剛算好的最新資料取代掉（找不到就加在最後面）。
    const otherRows = values
      .slice(1)
      .map((v, i) => {
        const f = formulas[i + 1] || [];
        return [0, 1, 2, 3, 4, 5].map((ci) => (f[ci] ? f[ci] : v[ci] ?? ""));
      })
      .filter((r) => String(r[0] || "").trim() && String(r[0] || "").trim() !== "合計" && String(r[0] || "").trim() !== campaignName);

    const ref = `'${tabName.replace(/'/g, "''")}'!`;
    const custEndRow = custStartRow + custCount - 1;
    const paidF = custCount > 0 ? `=SUM(${ref}E${custStartRow}:E${custEndRow})` : 0;
    const owingF = custCount > 0 ? `=SUM(${ref}F${custStartRow}:F${custEndRow})` : 0;
    const selfRow: (string | number)[] = [
      campaignName, `=${ref}C${incomeRow}`, `=${ref}C${costRow}`, `=${ref}C${profitRow}`, paidF, owingF,
    ];
    const dataRows: (string | number)[][] = [...otherRows, selfRow].map((r, i) => {
      const row = i + 2;
      return [...r, `=IF(B${row}=0,"",D${row}/B${row})`];
    });

    const finalData: (string | number)[][] = [["檔期", "銷售(收入)", "進貨成本", "淨利潤", "已收款金額", "未收款金額", "淨利潤率"], ...dataRows];
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
  const campaigns = await getAllCampaigns();
  const cache: SheetMetaCache = new Map();

  const mainTabNames = campaigns.map((c) => safeTabName(c.name));
  if (mainTabNames.length > 0) {
    await ensureSheetExistsCached(sheets, mainId, mainTabNames[0], cache).catch(() => {});
  }
  const mainMeta = cache.get(mainId);
  const existingMainTabs = new Set(mainTabNames.filter((t) => mainMeta?.has(t)));
  const mainRanges = mainTabNames.filter((t) => existingMainTabs.has(t)).map((t) => `${t}!A1:L100000`);
  const mainValuesMap = mainRanges.length > 0 ? await batchGetValues(sheets, mainId, mainRanges) : {};

  await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
  const costMeta = cache.get(costId);
  const costTabNames = campaigns.map((c) => safeTabName(c.name));
  const existingCostTabs = new Set(costTabNames.filter((t) => costMeta?.has(t)));
  const costRanges = costTabNames.filter((t) => existingCostTabs.has(t)).map((t) => `${t}!A1:G100000`);
  const [costValuesMap, costFormulasMap] = costRanges.length > 0
    ? await Promise.all([
        batchGetValues(sheets, costId, costRanges),
        batchGetValues(sheets, costId, costRanges, "FORMULA"),
      ])
    : [{}, {}];

  const summaryRows: { name: string; tab: string; incomeRow: number; costRow: number; profitRow: number; custStartRow: number; custCount: number }[] = [];
  const failed: string[] = [];
  const allRequests: BatchRequest[] = [];

  for (const c of campaigns) {
    try {
      const tabName = safeTabName(c.name);
      const mainValues = mainValuesMap[`${tabName}!A1:L100000`] || [];
      const agg = aggregateFromValues(mainValues);
      if (agg.products.length === 0) continue;

      const oldValues = costValuesMap[`${tabName}!A1:G100000`] || [];
      const oldFormulas = costFormulasMap[`${tabName}!A1:G100000`] || [];
      const { requests, custStartRow, custCount } = await buildCostTabRequests(sheets, costId, tabName, agg, oldValues, oldFormulas, cache);
      allRequests.push(...requests);
      const N = agg.products.length;
      summaryRows.push({ name: c.name, tab: tabName, incomeRow: N + 12, costRow: N + 13, profitRow: N + 15, custStartRow, custCount });
    } catch (e: any) {
      failed.push(`${c.name}：${e?.message || "未知錯誤"}`);
    }
  }

  const summarySheetId = await ensureSheetExistsCached(sheets, costId, "總覽", cache, 0);
  allRequests.push(...buildCostSummaryRequests(summarySheetId, summaryRows));

  if (allRequests.length > 0) {
    await withRetry(() => runBatch(sheets, costId, allRequests));
  }
  if (failed.length > 0) {
    throw new Error(`部分檔期成本表同步失敗（其餘檔期仍已正常同步）：${failed.join("；")}`);
  }
}
