import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
export const COST_SHEET_ID = process.env.GOOGLE_COST_SHEET_ID;
export { SHEET_ID };

function getAuth() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  let key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  // 如果不小心把前後的雙引號也一起貼進去了（例如貼到 Vercel 後台環境變數欄位時），先拿掉
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // 私鑰在環境變數裡通常會把換行符號變成字面上的 \n，這裡要還原成真正的換行
  key = key.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 格式看起來不正確（貼到 Vercel 後台時不需要加前後的雙引號，只要貼金鑰本身）");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export type SheetsClient = ReturnType<typeof google.sheets>;
export type BatchRequest = any; // Google Sheets API batchUpdate 的單一 request 物件

export async function getSheets(): Promise<SheetsClient> {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

export function requireSheetId(): string {
  if (!SHEET_ID) throw new Error("尚未設定 GOOGLE_SHEET_ID");
  return SHEET_ID;
}
export function requireCostSheetId(): string {
  if (!COST_SHEET_ID) throw new Error("尚未設定 GOOGLE_COST_SHEET_ID");
  return COST_SHEET_ID;
}

/** 欄號轉字母：1→A, 27→AA */
export function columnToLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m - 1) / 26);
  }
  return s;
}

/** 確保指定試算表裡有這個名稱的分頁，不存在就自動建立；回傳這個分頁的數字 ID（格式設定要用）。
 *  這個操作沒辦法跟其他請求合併（要先知道分頁存不存在、sheetId 是多少，才能組後續的請求），
 *  但只有第一次建立分頁時才會真的呼叫 API 寫入，之後每次同步都只是單純的 spreadsheets.get 查詢（不算在寫入配額裡）。 */
export async function ensureSheetExists(
  spreadsheetId: string,
  sheetName: string,
  insertAtIndex?: number
): Promise<{ sheets: SheetsClient; sheetId: number }> {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const target = (meta.data.sheets || []).find((s) => s.properties?.title === sheetName);
  if (!target) {
    const props: any = { title: sheetName };
    if (insertAtIndex != null) props.index = insertAtIndex;
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: props } }] },
    });
    const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
    return { sheets, sheetId: sheetId ?? 0 };
  }
  return { sheets, sheetId: target.properties?.sheetId ?? 0 };
}

/** 把一個儲存格的值轉成 Sheets API 的 CellData 格式；「=」開頭的字串視為公式 */
function toCellData(cell: string | number): any {
  if (cell === "" || cell == null) return {};
  if (typeof cell === "number") return { userEnteredValue: { numberValue: cell } };
  const s = String(cell);
  if (s.startsWith("=")) return { userEnteredValue: { formulaValue: s } };
  return { userEnteredValue: { stringValue: s } };
}

/** 建構「清空整個範圍」的請求（不會真的呼叫 API，只是組出請求物件，要跟其他請求一起送出） */
export function buildClearRequest(sheetId: number, endRowIndex = 100000, endColIndex = 26): BatchRequest {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex, startColumnIndex: 0, endColumnIndex: endColIndex },
      cell: {},
      fields: "userEnteredValue",
    },
  };
}

/** 建構「從某個位置開始寫入一整塊資料」的請求 */
export function buildWriteRequest(sheetId: number, startRow: number, startCol: number, values: (string | number)[][]): BatchRequest {
  return {
    updateCells: {
      start: { sheetId, rowIndex: startRow, columnIndex: startCol },
      rows: values.map((row) => ({ values: row.map(toCellData) })),
      fields: "userEnteredValue",
    },
  };
}

/** 建構「標題列排版」的請求們：粗體＋淺色底、凍結第一列、欄寬自動依內容調整 */
export function buildFormatHeaderRequests(sheetId: number, columnCount: number): BatchRequest[] {
  return [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.25, blue: 0.36 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
      },
    },
  ];
}

/** 建構「某個範圍套粗體」的請求（例如小標題列、合計列） */
export function buildBoldRangeRequest(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number): BatchRequest {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat",
    },
  };
}

/** 建構「某個範圍套數字格式」的請求（例如百分比 "0.0%"） */
export function buildNumberFormatRequest(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number, pattern: string): BatchRequest {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern } } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

/** 建構「顯示/隱藏分頁」的請求 */
export function buildHideSheetRequest(sheetId: number, hidden: boolean): BatchRequest {
  return { updateSheetProperties: { properties: { sheetId, hidden }, fields: "hidden" } };
}

/** 把一批請求一次送出（這是真正打 API 的地方，不管裡面包了幾個操作，Google 都只算「一次」寫入用量） */
export async function runBatch(sheets: SheetsClient, spreadsheetId: string, requests: BatchRequest[]) {
  if (requests.length === 0) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

export type SheetMetaCache = Map<string, Map<string, number>>; // spreadsheetId -> (分頁名稱 -> sheetId)

/** 查詢並快取一份試算表裡「分頁名稱→sheetId」的對照表，同一次同步流程裡，
 *  同一份試算表只會真的呼叫一次 spreadsheets.get，其餘都直接讀快取，不會再一直重複查 */
async function getSheetMetaCached(sheets: SheetsClient, spreadsheetId: string, cache: SheetMetaCache): Promise<Map<string, number>> {
  const cached = cache.get(spreadsheetId);
  if (cached) return cached;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const map = new Map<string, number>();
  for (const s of meta.data.sheets || []) {
    if (s.properties?.title != null && s.properties?.sheetId != null) map.set(s.properties.title, s.properties.sheetId);
  }
  cache.set(spreadsheetId, map);
  return map;
}

/** 跟 ensureSheetExists 功能一樣，但會用快取的分頁清單，避免每個企劃都各自查一次 spreadsheets.get。
 *  適合「立即完整同步一次」這種一次要處理很多企劃的情境。 */
export async function ensureSheetExistsCached(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetName: string,
  cache: SheetMetaCache,
  insertAtIndex?: number
): Promise<number> {
  const map = await getSheetMetaCached(sheets, spreadsheetId, cache);
  const existing = map.get(sheetName);
  if (existing != null) return existing;
  const props: any = { title: sheetName };
  if (insertAtIndex != null) props.index = insertAtIndex;
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: props } }] },
    });
    const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    map.set(sheetName, sheetId);
    return sheetId;
  } catch (e: any) {
    // 快取沒抓到、但實際上這個分頁已經存在（例如同名企劃、或快取剛好過期）：
    // 不要直接把整個同步搞失敗，重新查一次「當下真實」的分頁清單，找到就沿用它
    if (/already exists/i.test(String(e?.message || ""))) {
      const fresh = await sheets.spreadsheets.get({ spreadsheetId });
      const freshMap = new Map<string, number>();
      for (const s of fresh.data.sheets || []) {
        if (s.properties?.title != null && s.properties?.sheetId != null) freshMap.set(s.properties.title, s.properties.sheetId);
      }
      cache.set(spreadsheetId, freshMap);
      const found = freshMap.get(sheetName);
      if (found != null) return found;
    }
    throw e;
  }
}

/** 一次讀取「同一份試算表裡」好幾個範圍的值（例如好幾個企劃各自的分頁），
 *  用 Google 的 batchGet，不管要讀幾個範圍都只算「一次」讀取用量。
 *  範圍如果對應到不存在的分頁會整批出錯，所以呼叫端要自己先過濾掉還不存在的分頁。 */
export async function batchGetValues(
  sheets: SheetsClient,
  spreadsheetId: string,
  ranges: string[],
  valueRenderOption?: "FORMULA"
): Promise<Record<string, any[][]>> {
  if (ranges.length === 0) return {};
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, valueRenderOption });
  const map: Record<string, any[][]> = {};
  (res.data.valueRanges || []).forEach((vr, i) => {
    map[ranges[i]] = vr.values || [];
  });
  return map;
}

/** 刪除指定名稱的分頁（如果存在的話；不存在就什麼都不做，安全可以重複呼叫） */
export async function deleteSheetTabIfExists(spreadsheetId: string, sheetName: string) {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const target = (meta.data.sheets || []).find((s) => s.properties?.title === sheetName);
  if (!target || target.properties?.sheetId == null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteSheet: { sheetId: target.properties.sheetId } }] },
  });
}

/** 讀取一個範圍的「值」跟「公式」（公式儲存格會回傳公式字串，其餘回傳計算後的值） */
export async function getValuesAndFormulas(sheets: SheetsClient, spreadsheetId: string, range: string) {
  const [valuesRes, formulasRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
    sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: "FORMULA" }),
  ]);
  return { values: valuesRes.data.values || [], formulas: formulasRes.data.values || [] };
}

/** 在指定分頁最後面加一列（適合訂單這種「一直新增、不會修改」的資料）。
 *  這支目前沒有地方在用（訂單同步改成整份重寫），保留是為了以後如果需要「只加一列」的輕量寫法。 */
export async function appendRow(sheetName: string, headerRow: string[], row: (string | number)[]) {
  const id = requireSheetId();
  const { sheets, sheetId } = await ensureSheetExists(id, sheetName);

  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${sheetName}!A1:Z1` });
  const requests: BatchRequest[] = [];
  if (!existing.data.values || existing.data.values.length === 0) {
    requests.push(buildWriteRequest(sheetId, 0, 0, [headerRow]), ...buildFormatHeaderRequests(sheetId, headerRow.length));
    await runBatch(sheets, id, requests);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

/** 清空指定分頁、整份重新寫入（適合會員/企劃/商品這種「會被編輯、需要跟資料庫保持一致」的資料）。
 *  清空＋寫入＋格式設定，全部組成一份請求清單，一次送出。 */
export async function overwriteSheet(sheetName: string, headerRow: string[], rows: (string | number)[][]) {
  const id = requireSheetId();
  const { sheets, sheetId } = await ensureSheetExists(id, sheetName);

  const requests: BatchRequest[] = [
    buildClearRequest(sheetId),
    buildWriteRequest(sheetId, 0, 0, [headerRow, ...rows]),
    ...buildFormatHeaderRequests(sheetId, headerRow.length),
  ];
  await runBatch(sheets, id, requests);
}
