import { getSupabaseAdmin } from "@/lib/supabase";
import {

  requireCostSheetId,
  ensureSheetExists,
  buildClearRequest,
  buildWriteRequest,
  buildFormatHeaderRequests,
  buildUnhideColumnsRequest,
  type BatchRequest,
} from "@/lib/googleSheets";

/**
 * 3.3節第9項：成本SHEET。
 *
 * 為什麼用 Google Sheets 而不是自己做試算表元件：規格書要求「欄位要能填公式自動運算，
 * 不是後端寫死邏輯算好結果再顯示成靜態表格」。Google Sheets 本身就是完整的試算表，
 * 系統只負責把資料跟預設公式寫進去，實際運算交給 Google，店家也能自由加欄位、改公式。
 *
 * 同步策略（比照 mibu-app 舊站的做法）：
 * 覆蓋同一個分頁（分頁名稱＝檔期名稱），但**會先讀回店家手填的儲存格再填回去**，
 * 所以重新同步不會把店家自己填的匯率、每公斤運費、其他成本洗掉。
 */

/** 這些列的標籤是系統產生的，讀回舊值時用來辨識哪些是店家手填的欄位 */
const MANUAL_LABELS = ["匯率", "每公斤運費(NT$)", "其他成本"];

export interface CostTabRefs {
  tabName: string;
  incomeRow: number;   // 總收入所在行
  costRow: number;     // 總成本所在行
  profitRow: number;   // 淨利潤所在行
  custStartRow: number; // 客戶明細第一列
  custCount: number;    // 客戶筆數
}

export async function syncCostSheetForCampaign(campaignId: string): Promise<CostTabRefs> {
  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, split_calc_fx_rate, shipping_cost_per_kg")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) throw new Error("找不到這個檔期");

  const tabName = campaign.name;

  // ── 收入面：這個檔期所有訂單的商品明細 ──────────────────────────
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, username, paid_amount, order_items(product_name, style, qty, unit_price, subtotal, unit_price_original, series_name_snapshot), order_gift_selections(style_name_snapshot, qty)")
    .eq("campaign_id", campaignId);

  const orderIds = (orders || []).map((o: any) => o.id);

  // 把相同商品/款式合併成一列（成本表看的是整期的量，不是逐筆訂單）
  type ProductRow = { series: string; name: string; style: string; qty: number };
  const productMap = new Map<string, ProductRow>();
  (orders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      const key = `${it.series_name_snapshot || ""}||${it.product_name}||${it.style || ""}`;
      const exist = productMap.get(key);
      if (exist) {
        exist.qty += it.qty;
      } else {
        productMap.set(key, {
          series: it.series_name_snapshot || "",
          name: it.product_name,
          style: it.style || "",
          qty: it.qty,
        });
      }
    });
  });
  const products = Array.from(productMap.values());

  // ── 顧客運費：出貨批次算出來的顧客運費加總 ──────────────────────
  const { data: shippingBatches } = orderIds.length
    ? await supabase.from("shipping_batches").select("order_id, customer_shipping_fee").in("order_id", orderIds)
    : { data: [] };
  // 同一張訂單可能分好幾個出貨批次，運費要加總起來
  const shippingFeeByOrder = new Map<string, number>();
  (shippingBatches || []).forEach((b: any) => {
    shippingFeeByOrder.set(b.order_id, (shippingFeeByOrder.get(b.order_id) || 0) + (Number(b.customer_shipping_fee) || 0));
  });

  // ── 成本面：採購單「實收」加總（原幣）──────────────────────────
  const { data: batches } = await supabase
    .from("vendor_purchase_batches")
    .select("id, extra_adjustment")
    .eq("campaign_id", campaignId);
  const batchIds = (batches || []).map((b: any) => b.id);

  const { data: batchItems } = batchIds.length
    ? await supabase
        .from("vendor_purchase_batch_items")
        .select("batch_id, qty, order_items(unit_price_original, has_discount_flag_snapshot)")
        .in("batch_id", batchIds)
    : { data: [] };
  const { data: discountTiers } = await supabase
    .from("vendor_discount_tiers")
    .select("threshold_amount, discount_amount")
    .eq("campaign_id", campaignId)
    .order("threshold_amount", { ascending: false });

  // 每張採購單的實收 = 原幣小計 − 折扣（只看有滿減標記的金額）+ 額外調整
  let purchaseNetTotal = 0;
  (batches || []).forEach((b: any) => {
    const items = (batchItems || []).filter((it: any) => it.batch_id === b.id);
    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0);
    const discountable = items.reduce(
      (s: number, it: any) => s + (it.order_items?.has_discount_flag_snapshot ? (Number(it.order_items?.unit_price_original) || 0) * it.qty : 0),
      0
    );
    const tier = (discountTiers || []).find((t: any) => discountable >= Number(t.threshold_amount));
    const discount = tier ? Number(tier.discount_amount) : 0;
    purchaseNetTotal += subtotal - discount + (Number(b.extra_adjustment) || 0);
  });

  // ── 額外採購成本（原幣）──────────────────────────────────────
  const { data: extraPurchases } = await supabase
    .from("vendor_extra_purchases")
    .select("qty, subtotal, gift_styles(style_name)")
    .eq("campaign_id", campaignId);
  const extraRows = (extraPurchases || []).map((p: any) => ({
    styleName: p.gift_styles?.style_name || "（款式已刪除）",
    qty: p.qty,
    subtotal: Number(p.subtotal) || 0,
  }));
  const extraPurchaseTotal = extraRows.reduce((s, r) => s + r.subtotal, 0);

  // ── 運費成本：所有物流單號的重量加總 ──────────────────────────
  const { data: orderNumbers } = batchIds.length
    ? await supabase.from("vendor_order_numbers").select("id").in("batch_id", batchIds)
    : { data: [] };
  const orderNumberIds = (orderNumbers || []).map((o: any) => o.id);
  const { data: shipments } = orderNumberIds.length
    ? await supabase.from("vendor_shipments").select("weight_kg").in("vendor_order_number_id", orderNumberIds)
    : { data: [] };
  const totalWeightKg = (shipments || []).reduce((s: number, sh: any) => s + (Number(sh.weight_kg) || 0), 0);

  // ── 讀回舊表：保留店家手填的儲存格（匯率、每公斤運費、其他成本）──
  const costId = requireCostSheetId();
  const { sheets, sheetId } = await ensureSheetExists(costId, tabName);

  const manualValues = new Map<string, any>();
  try {
    const [valuesRes, formulasRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: costId, range: `${tabName}!A1:H200` }),
      sheets.spreadsheets.values.get({
        spreadsheetId: costId,
        range: `${tabName}!A1:H200`,
        valueRenderOption: "FORMULA",
      }),
    ]);
    const oldValues = valuesRes.data.values || [];
    const oldFormulas = formulasRes.data.values || [];
    oldValues.forEach((row: any[], i: number) => {
      const label = String(row?.[0] || "").trim();
      if (MANUAL_LABELS.includes(label)) {
        // 公式優先（店家可能填的是公式而不是固定數字）
        manualValues.set(label, oldFormulas[i]?.[2] ?? row?.[2] ?? "");
      }
    });
  } catch {
    // 分頁是新建的、還沒有內容，沒有舊值要保留
  }

  const fxRateCell = manualValues.get("匯率") ?? (campaign.split_calc_fx_rate ?? "");
  const perKgCell = manualValues.get("每公斤運費(NT$)") ?? (campaign.shipping_cost_per_kg ?? "");
  const otherCostCell = manualValues.get("其他成本") ?? "";

  // ── 組表格內容 ──────────────────────────────────────────────
  const data: (string | number)[][] = [];
  /** 加一列，回傳它在 Google Sheets 上的行號（從1開始）。
   *  之前用「陣列索引」當行號導致所有公式差1行、總覽算不出資料，改成寫入時當場記錄。 */
  const addRow = (row: (string | number)[]) => {
    data.push(row);
    return data.length; // data.length 就是這一列的行號（第1列 → length=1）
  };
  const pad = (arr: (string | number)[]) => {
    const r = [...arr];
    while (r.length < 8) r.push("");
    return r;
  };

  // ── 商品統計：這期總共要跟廠商買幾件（金額看下面的客戶明細）──
  addRow(pad(["【商品統計】"]));
  addRow(pad(["系列", "商品", "款式", "數量"]));
  products.forEach((p) => addRow(pad([p.series, p.name, p.style, p.qty])));
  addRow(pad([]));

  // ── 客戶明細：規格書3.3節要求「顧客姓名獨立成一欄，跟該筆訂單的滿贈選擇並列」──
  addRow(pad(["【客戶明細】"]));
  addRow(pad(["客戶", "訂單編號", "商品小計", "應收運費", "應收總額", "已收", "尚欠", "滿贈選擇"]));
  const customerRowNumbers: number[] = [];
  (orders || []).forEach((o: any) => {
    const itemsSubtotal = (o.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
    const shippingFee = shippingFeeByOrder.get(o.id) || 0;
    const paid = Number(o.paid_amount) || 0;
    const giftText = (o.order_gift_selections || [])
      .map((g: any) => `${g.style_name_snapshot} x${g.qty}`)
      .join("、");
    const r = addRow(pad([o.username, o.order_no, itemsSubtotal, shippingFee, "", paid, "", giftText]));
    customerRowNumbers.push(r);
    // 應收總額＝商品小計＋應收運費；尚欠＝應收總額−已收
    data[r - 1][4] = `=C${r}+D${r}`;
    data[r - 1][6] = `=E${r}-F${r}`;
  });
  const firstCustomerRow = customerRowNumbers[0];
  const lastCustomerRow = customerRowNumbers[customerRowNumbers.length - 1];
  addRow(pad([]));

  // ── 收入 ──
  addRow(pad(["【收入】"]));
  const incomeProductRow = addRow(
    pad(["商品收入", "", firstCustomerRow ? `=SUM(C${firstCustomerRow}:C${lastCustomerRow})` : 0])
  );
  const incomeShippingRow = addRow(
    pad(["顧客運費", "", firstCustomerRow ? `=SUM(D${firstCustomerRow}:D${lastCustomerRow})` : 0])
  );
  const totalIncomeRow = addRow(pad(["總收入", "", `=C${incomeProductRow}+C${incomeShippingRow}`]));
  addRow(pad([]));

  // ── 成本 ──
  addRow(pad(["【成本】"]));
  const fxRow = addRow(pad(["匯率", "", fxRateCell, "← 這格自己填（系統不覆蓋）"]));
  const purchaseRow = addRow(pad(["採購實收合計(￥)", "", purchaseNetTotal, "所有採購單的實收加總（已含折扣與額外調整）"]));
  const purchaseCostRow = addRow(pad(["進貨成本(NT$)", "", `=CEILING(C${purchaseRow}*C${fxRow})`]));
  const extraRow = addRow(pad(["額外採購(￥)", "", extraPurchaseTotal]));
  const extraCostRow = addRow(pad(["額外採購成本(NT$)", "", `=CEILING(C${extraRow}*C${fxRow})`]));
  const weightRow = addRow(pad(["總重量(KG)", "", totalWeightKg, "所有物流單號的重量加總"]));
  const perKgRow = addRow(pad(["每公斤運費(NT$)", "", perKgCell, "← 這格自己填（系統不覆蓋）"]));
  const shippingCostRow = addRow(pad(["運費成本(NT$)", "", `=C${weightRow}*C${perKgRow}`]));
  const otherRow = addRow(pad(["其他成本", "", otherCostCell, "← 這格自己填（系統不覆蓋）"]));
  const totalCostRow = addRow(
    pad([
      "總成本(NT$)",
      "",
      `=C${purchaseCostRow}+C${extraCostRow}+C${shippingCostRow}+IF(C${otherRow}="",0,C${otherRow})`,
    ])
  );
  addRow(pad([]));

  // ── 總覽 ──
  addRow(pad(["【總覽】"]));
  addRow(pad(["總收入(NT$)", "", `=C${totalIncomeRow}`]));
  addRow(pad(["總成本(NT$)", "", `=C${totalCostRow}`]));
  const netProfitRow = addRow(pad(["淨利潤(NT$)", "", `=C${totalIncomeRow}-C${totalCostRow}`]));
  addRow(pad(["淨利潤率", "", `=IF(C${totalIncomeRow}=0,"",C${netProfitRow}/C${totalIncomeRow})`]));

  // ── 額外採購明細（方便核對）──
  if (extraRows.length > 0) {
    addRow(pad([]));
    addRow(pad(["【額外採購明細】"]));
    addRow(pad(["滿贈款式", "數量", "成本(￥)"]));
    extraRows.forEach((r) => addRow(pad([r.styleName, r.qty, r.subtotal])));
  }

  // 清空範圍要貼合實際欄數（新分頁預設只有 A~Z 共26欄，用預設值容易超出範圍報錯），
  // 列數取「舊資料可能的長度」與「這次要寫的長度」的較大值，確保舊內容被清乾淨
  const COLUMN_COUNT = 8;
  const clearRows = Math.max(data.length + 50, 200);
  const requests: BatchRequest[] = [
    // 先確保分頁夠大：新分頁預設 1000 列 x 26 欄，資料多的時候要先擴充，不然寫入會超出範圍
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { rowCount: Math.max(clearRows, 1000), columnCount: Math.max(COLUMN_COUNT, 26) } },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    },
    buildUnhideColumnsRequest(sheetId, 0, 26),
    buildClearRequest(sheetId, clearRows, COLUMN_COUNT),
    buildWriteRequest(sheetId, 0, 0, data),
    ...buildFormatHeaderRequests(sheetId, COLUMN_COUNT),
  ];
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: costId, requestBody: { requests } });

  return {
    tabName,
    incomeRow: totalIncomeRow,
    costRow: totalCostRow,
    profitRow: netProfitRow,
    custStartRow: firstCustomerRow || 0,
    custCount: customerRowNumbers.length,
  };
}

/**
 * 「總覽」分頁：把所有檔期的收入／成本／淨利潤彙總成一張表，
 * 每一格都用跨分頁公式引用各檔期的成本表，所以檔期成本表更新後總覽會自動跟著變。
 */
export async function syncCostSummary(refs: CostTabRefs[]): Promise<void> {
  const costId = requireCostSheetId();
  // 總覽固定放在第一個分頁，打開試算表就先看到
  const { sheets, sheetId } = await ensureSheetExists(costId, "總覽", 0);

  const header = ["檔期", "銷售(收入)", "進貨成本", "淨利潤", "已收款金額", "未收款金額", "淨利潤率"];
  const data: (string | number)[][] = [header];

  refs.forEach((r, i) => {
    const row = i + 2;
    const ref = `'${r.tabName.replace(/'/g, "''")}'!`;
    const custEndRow = r.custStartRow + r.custCount - 1;
    // 已收＝客戶明細的F欄、未收＝G欄（客戶明細欄位：A客戶 B訂單編號 C商品小計 D應收運費 E應收總額 F已收 G尚欠）
    const paidF = r.custCount > 0 ? `=SUM(${ref}F${r.custStartRow}:F${custEndRow})` : 0;
    const owingF = r.custCount > 0 ? `=SUM(${ref}G${r.custStartRow}:G${custEndRow})` : 0;
    data.push([
      r.tabName,
      `=${ref}C${r.incomeRow}`,
      `=${ref}C${r.costRow}`,
      `=${ref}C${r.profitRow}`,
      paidF,
      owingF,
      `=IF(B${row}=0,"",D${row}/B${row})`,
    ]);
  });

  const n = refs.length;
  if (n > 0) {
    const first = 2;
    const last = 1 + n;
    const totalRow = n + 3;
    data.push(["", "", "", "", "", "", ""]);
    data.push([
      "合計",
      `=SUM(B${first}:B${last})`,
      `=SUM(C${first}:C${last})`,
      `=SUM(D${first}:D${last})`,
      `=SUM(E${first}:E${last})`,
      `=SUM(F${first}:F${last})`,
      `=IF(B${totalRow}=0,"",D${totalRow}/B${totalRow})`,
    ]);
  }

  const requests: BatchRequest[] = [
    buildUnhideColumnsRequest(sheetId, 0, 26),
    buildClearRequest(sheetId, Math.max(data.length + 50, 200), 7),
    buildWriteRequest(sheetId, 0, 0, data),
    ...buildFormatHeaderRequests(sheetId, 7),
  ];
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: costId, requestBody: { requests } });
}
