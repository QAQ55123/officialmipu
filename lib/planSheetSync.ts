import { getSupabaseAdmin } from "./supabase";
import { paymentLabel } from "./util";
import { displayNamesByUsername } from "./memberDisplayName";
import {
  getSheets, requireSheetId, ensureSheetExistsCached, buildClearRequest, buildWriteRequest, buildBoldRangeRequest, buildUnhideColumnsRequest, runBatch,
  type BatchRequest, type SheetsClient, type SheetMetaCache,
} from "./googleSheets";

// 一次結帳＝一張訂單、可跨系列，所以要標系列才分得出來是哪個系列的商品
const ORDER_HEADER = ["訂單編號", "來源", "帳號", "會員名稱", "FB個人網址", "系列", "商品名稱", "款式", "數量", "單價", "小計", "訂單時間", "交易方式", "付款狀態", "滿贈"];

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

type CampaignRow = { id: string; name: string };

/** item 7：容器從企劃改成檔期，一個檔期一份分頁，依開放起始時間排序（不再有「進行中／常駐／已截止」分組） */
async function getAllCampaigns(): Promise<CampaignRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("campaigns").select("id, name, sort_order").order("sort_order", { ascending: true });
  return (data || []) as any[];
}

async function getCampaignOrders(campaignId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("orders").select("*, order_items(*), order_gift_selections(style_name_snapshot, qty)").eq("campaign_id", campaignId).order("created_at", { ascending: true });
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
  // 會員名稱（匯出賣貨便用的名稱）；對不到會員的舊訂單留空
  const displayNames = await displayNamesByUsername(getSupabaseAdmin(), orders.map((o: any) => o.username));

  // 從訂單品項推導出這個檔期實際用到的商品目錄（同名同款式只留一筆，金額用最後出現的那筆）
  const orderRows: (string | number)[][] = [];
  orders.forEach((o: any) => {
    const paidAmount = Number(o.paid_amount) || 0;
    // 滿贈是「一張訂單」層級的，只寫在該訂單第一個品項那一列，其餘留空避免重複
    const giftText = (o.order_gift_selections || [])
      .map((g: any) => `${g.style_name_snapshot} x${g.qty}`)
      .join("、");
    (o.order_items || []).forEach((it: any, itemIdx: number) => {
      orderRows.push([
        o.order_no, "", o.username, displayNames.get(String(o.username || "").trim().toLowerCase()) || "", o.profile_url,
        it.series_name_snapshot || o.series_name_snapshot || "",
        it.product_name, it.style || "",
        it.qty, Number(it.unit_price) || 0, Number(it.subtotal) || 0,
        new Date(o.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }), paymentLabel(o.payment), paidAmount > 0 ? paidAmount : "",
        itemIdx === 0 ? giftText : "",
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
