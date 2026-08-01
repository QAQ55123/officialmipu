import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * POST /api/admin/products/import
 * multipart/form-data: file（CSV或Excel）、seriesId
 *
 * 欄位格式（比照 mibu-app 原本模式：一列＝一個具體款式，同一個商品名稱可以重複好幾列）：
 *   商品名稱 | 款式 | 金額 | 運費金額 | 是否滿減
 * - 是否滿減：v = true，留空 = false
 * - 同名的商品名稱，會自動歸到同一個商品底下（沒有就新建）
 * - 圖片不透過CSV，比照2.2節後台再手動貼網址或上傳
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
  if (!file) return NextResponse.json({ error: "請選擇要匯入的檔案" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rows.length === 0) return NextResponse.json({ error: "檔案內沒有資料列" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const results: { row: number; name: string; ok: boolean; error?: string }[] = [];
  const productIdByName = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row["商品名稱"] ?? "").trim();
    const styleName = String(row["款式"] ?? "").trim() || null;
    const amount = Number(row["金額"]);
    const shippingFee = Number(row["運費金額"]) || 0;
    const hasDiscountFlag = String(row["是否滿減"] ?? "").trim().toLowerCase() === "v";

    if (!name) {
      results.push({ row: i + 2, name: "", ok: false, error: "商品名稱空白，略過" });
      continue;
    }
    if (!isFinite(amount)) {
      results.push({ row: i + 2, name, ok: false, error: "金額格式不正確，略過" });
      continue;
    }

    try {
      let productId = productIdByName.get(name);
      if (!productId) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .insert({ series_id: seriesId || null, name })
          .select()
          .single();
        if (productError) throw new Error(productError.message);
        productId = product.id;
        productIdByName.set(name, productId!);
      }

      const { error: variantError } = await supabase
        .from("product_variants")
        .insert({ product_id: productId, style_name: styleName, amount, shipping_fee: shippingFee, has_discount_flag: hasDiscountFlag });
      if (variantError) throw new Error(variantError.message);

      results.push({ row: i + 2, name, ok: true });
    } catch (e: any) {
      results.push({ row: i + 2, name, ok: false, error: e.message });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ total: rows.length, success: successCount, failed: rows.length - successCount, results });
}
