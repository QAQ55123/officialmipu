import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * 商品批次匯入（2.2節）：欄位「商品名稱｜款式｜金額｜運費金額｜是否滿減(v)｜圖片網址」，
 * 一列＝一個具體款式，同名商品自動歸到同一組（比照 mibu-app 原本模式，products 本身就是扁平結構）。
 * 表單欄位：file（CSV/Excel 檔案）、seriesId（要匯入到哪個系列）
 */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const seriesId = form.get("seriesId") as string | null;
    if (!file) return NextResponse.json({ error: "請選擇要上傳的檔案" }, { status: 400 });
    if (!seriesId) return NextResponse.json({ error: "請選擇要匯入到哪個系列" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, any>[];

    if (rows.length === 0) return NextResponse.json({ error: "檔案裡沒有資料列" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("products").select("sort_order").eq("series_id", seriesId).order("sort_order", { ascending: false }).limit(1);
    let nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    let success = 0;
    const failed: string[] = [];
    const insertRows: any[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 試算表第1列是標題，資料從第2列開始
      const name = String(row["商品名稱"] ?? "").trim();
      const style = String(row["款式"] ?? "").trim();
      const priceRaw = row["金額"];
      const shippingRaw = row["運費金額"];
      const discountRaw = String(row["是否滿減"] ?? "").trim().toLowerCase();
      const imageUrlRaw = String(row["圖片網址"] ?? "").trim();

      if (!name) {
        failed.push(`第 ${rowNum} 列：缺少商品名稱，略過`);
        return;
      }
      const price = Number(priceRaw);
      if (!isFinite(price) || price < 0) {
        failed.push(`第 ${rowNum} 列：${name}${style ? `（${style}）` : ""} — 金額格式不正確，略過`);
        return;
      }
      const shippingFee = shippingRaw === "" ? 0 : Number(shippingRaw);
      if (!isFinite(shippingFee) || shippingFee < 0) {
        failed.push(`第 ${rowNum} 列：${name}${style ? `（${style}）` : ""} — 運費金額格式不正確，略過`);
        return;
      }
      const hasDiscountFlag = discountRaw === "v";

      insertRows.push({
        series_id: seriesId,
        name,
        style,
        price,
        shipping_fee: shippingFee,
        has_discount_flag: hasDiscountFlag,
        cod_allowed: true,
        image_url: imageUrlRaw ? toDirectImageUrl(imageUrlRaw) : null,
        sort_order: nextSortOrder++,
      });
      success++;
    });

    if (insertRows.length > 0) {
      const { error } = await supabase.from("products").insert(insertRows);
      if (error) return NextResponse.json({ error: "寫入資料庫失敗：" + error.message }, { status: 500 });
    }

    return NextResponse.json({ total: rows.length, success, failed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "匯入失敗" }, { status: 500 });
  }
}
