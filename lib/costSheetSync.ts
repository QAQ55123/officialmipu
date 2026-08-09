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

export async function syncCostSheetForCampaign(campaignId: string): Promise<{ tabName: string }> {
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
    .select("id, order_no, username, order_items(product_name, style, qty, unit_price, subtotal, unit_price_original, series_name_snapshot)")
    .eq("campaign_id", campaignId);

  const orderIds = (orders || []).map((o: any) => o.id);

  // 把相同商品/款式合併成一列（成本表看的是整期的量，不是逐筆訂單）
  type ProductRow = { series: string; name: string; style: string; price: number; qty: number };
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
          price: Number(it.unit_price) || 0,
          qty: it.qty,
        });
      }
    });
  });
  const products = Array.from(productMap.values());

  // ── 顧客運費：出貨批次算出來的顧客運費加總 ──────────────────────
  const { data: shippingBatches } = orderIds.length
    ? await supabase.from("shipping_batches").select("customer_shipping_fee").in("order_id", orderIds)
    : { data: [] };
  const customerShippingTotal = (shippingBatches || []).reduce(
    (s: number, b: any) => s + (Number(b.customer_shipping_fee) || 0),
    0
  );

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

  // 商品明細
  data.push(["系列", "商品", "款式", "售價(NT$)", "數量", "小計(NT$)", "", ""]);
  products.forEach((p, i) => {
    const row = 2 + i;
    data.push([p.series, p.name, p.style, p.price, p.qty, `=D${row}*E${row}`, "", ""]);
  });
  const lastProductRow = products.length + 1;
  data.push(["", "", "", "", "", "", "", ""]);

  // 收入面
  const incomeStart = products.length + 3;
  data.push(["【收入】", "", "", "", "", "", "", ""]);
  data.push(["商品收入", "", products.length > 0 ? `=SUM(F2:F${lastProductRow})` : 0, "", "", "", "", ""]);
  data.push(["顧客運費", "", customerShippingTotal, "", "", "", "", ""]);
  const incomeProductRow = incomeStart + 1;
  const incomeShippingRow = incomeStart + 2;
  data.push(["總收入", "", `=C${incomeProductRow}+C${incomeShippingRow}`, "", "", "", "", ""]);
  data.push(["", "", "", "", "", "", "", ""]);

  // 成本面
  const costStart = incomeStart + 5;
  data.push(["【成本】", "", "", "", "", "", "", ""]);
  data.push(["匯率", "", fxRateCell, "← 這格自己填（系統不覆蓋）", "", "", "", ""]);
  const fxRow = costStart + 1;
  data.push(["採購實收合計(￥)", "", purchaseNetTotal, "所有採購單的實收加總（已含折扣與額外調整）", "", "", "", ""]);
  const purchaseRow = costStart + 2;
  data.push(["進貨成本(NT$)", "", `=CEILING(C${purchaseRow}*C${fxRow})`, "", "", "", "", ""]);
  data.push(["額外採購(￥)", "", extraPurchaseTotal, "", "", "", "", ""]);
  const extraRow = costStart + 4;
  data.push(["額外採購成本(NT$)", "", `=CEILING(C${extraRow}*C${fxRow})`, "", "", "", "", ""]);
  data.push(["總重量(KG)", "", totalWeightKg, "所有物流單號的重量加總", "", "", "", ""]);
  const weightRow = costStart + 6;
  data.push(["每公斤運費(NT$)", "", perKgCell, "← 這格自己填（系統不覆蓋）", "", "", "", ""]);
  const perKgRow = costStart + 7;
  data.push(["運費成本(NT$)", "", `=C${weightRow}*C${perKgRow}`, "", "", "", "", ""]);
  data.push(["其他成本", "", otherCostCell, "← 這格自己填（系統不覆蓋）", "", "", "", ""]);
  const purchaseCostRow = costStart + 3;
  const extraCostRow = costStart + 5;
  const shippingCostRow = costStart + 8;
  const otherRow = costStart + 9;
  data.push([
    "總成本(NT$)",
    "",
    `=C${purchaseCostRow}+C${extraCostRow}+C${shippingCostRow}+IF(C${otherRow}="",0,C${otherRow})`,
    "",
    "",
    "",
    "",
    "",
  ]);
  data.push(["", "", "", "", "", "", "", ""]);

  // 總覽
  const totalIncomeRow = incomeStart + 3;
  const totalCostRow = costStart + 10;
  data.push(["【總覽】", "", "", "", "", "", "", ""]);
  data.push(["淨利潤(NT$)", "", `=C${totalIncomeRow}-C${totalCostRow}`, "", "", "", "", ""]);

  // 額外採購明細（放在最後，方便核對）
  if (extraRows.length > 0) {
    data.push(["", "", "", "", "", "", "", ""]);
    data.push(["【額外採購明細】", "", "", "", "", "", "", ""]);
    data.push(["滿贈款式", "數量", "成本(￥)", "", "", "", "", ""]);
    extraRows.forEach((r) => data.push([r.styleName, r.qty, r.subtotal, "", "", "", "", ""]));
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

  return { tabName };
}
