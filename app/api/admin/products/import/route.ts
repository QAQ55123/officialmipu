import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * POST /api/admin/products/import
 * multipart/form-data: file（CSV或Excel）、seriesId、campaignId
 *
 * 欄位格式（依規格書 2.2節）：
 *   商品名稱 | 款式 | 金額 | 運費金額 | 是否滿減
 * - 款式欄位用逗號分隔多款式（如 "A,B,C,D"），留空 = 單一款式
 * - 是否滿減欄位：v = true（決定結帳時匯率軌），留空 = false
 * - 這只是批次匯入的捷徑，不是唯一新增方式，後台仍可用表單手動新增/編輯
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const seriesId = formData.get("seriesId") as string | null;
  const campaignId = formData.get("campaignId") as string | null;

  if (!file) return NextResponse.json({ error: "請選擇要匯入的檔案" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ error: "檔案內沒有資料列" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const results: { row: number; name: string; ok: boolean; error?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // 容忍欄位名稱有無空白差異
    const name = String(row["商品名稱"] ?? "").trim();
    const styleRaw = String(row["款式"] ?? "").trim();
    const amount = Number(row["金額"]);
    const shippingFee = Number(row["運費金額"]) || 0;
    const discountFlagRaw = String(row["是否滿減"] ?? "").trim().toLowerCase();
    const hasDiscountFlag = discountFlagRaw === "v";

    if (!name) {
      results.push({ row: i + 2, name: "", ok: false, error: "商品名稱空白，略過" });
      continue;
    }
    if (!isFinite(amount)) {
      results.push({ row: i + 2, name, ok: false, error: "金額格式不正確，略過" });
      continue;
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        series_id: seriesId || null,
        name,
        amount,
        shipping_fee: shippingFee,
        has_discount_flag: hasDiscountFlag,
      })
      .select()
      .single();

    if (productError) {
      results.push({ row: i + 2, name, ok: false, error: productError.message });
      continue;
    }

    // 款式用逗號分隔，留空 = 單一款式（無款式選項）
    const styles = styleRaw
      ? styleRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const variantRows: { product_id: string; style_name: string | null }[] =
      styles.length > 0
        ? styles.map((s) => ({ product_id: product.id, style_name: s }))
        : [{ product_id: product.id, style_name: null }];

    const { error: variantError } = await supabase.from("product_variants").insert(variantRows);
    if (variantError) {
      results.push({ row: i + 2, name, ok: false, error: variantError.message });
      continue;
    }

    // 匯入通常是「幫這個檔期批次新增商品」，所以新商品建立後順便加進該檔期（若有指定 campaignId）
    if (campaignId) {
      const { error: linkError } = await supabase.from("campaign_products").insert({ campaign_id: campaignId, product_id: product.id });
      if (linkError) {
        results.push({ row: i + 2, name, ok: false, error: `商品已建立，但加入檔期失敗：${linkError.message}` });
        continue;
      }
    }

    results.push({ row: i + 2, name, ok: true });
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    total: rows.length,
    success: successCount,
    failed: rows.length - successCount,
    results,
  });
}
