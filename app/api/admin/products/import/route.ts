import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { toDirectImageUrl } from "@/lib/imageUrl";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * 商品批次匯入（2.2節）：欄位「系列名稱｜系列圖片網址｜商品名稱｜款式｜金額｜運費金額｜是否滿減(v)｜圖片網址｜封面圖網址」，
 * 一列＝一個具體款式，同名商品自動歸到同一組（比照 mibu-app 原本模式，products 本身就是扁平結構）。
 *
 * 修正：改成「選一個分類 → 依 Excel 裡的『系列名稱』欄位，在該分類底下自動建立/沿用對應的系列」，
 * 一次可以匯入好幾個不同系列的商品，不用先手動一個一個把系列建好。
 *
 * 「金額」是人民幣原幣、「運費金額」是台幣，兩個幣別不同。
 * 「圖片網址」是這個款式自己的照片；「封面圖網址」是商品層級共用的封面圖，同名的列只要有任何一列填了，
 * 這個商品名稱底下所有款式列都會同步套用同一張封面圖。
 * 表單欄位：file（CSV/Excel 檔案）、categoryId（要匯入到哪個分類）
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
    const categoryId = form.get("categoryId") as string | null;
    if (!file) return NextResponse.json({ error: "請選擇要上傳的檔案" }, { status: 400 });
    if (!categoryId) return NextResponse.json({ error: "請選擇要匯入到哪個分類" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, any>[];

    if (rows.length === 0) return NextResponse.json({ error: "檔案裡沒有資料列" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // 依「系列名稱」找出或建立系列（同一個分類底下同名的系列只會有一個）
    const seriesCache = new Map<string, string>(); // 系列名稱 -> series_id
    const sortOrderBySeriesId = new Map<string, number>();
    async function resolveSeriesId(seriesName: string, seriesImageUrl: string): Promise<string> {
      if (seriesCache.has(seriesName)) return seriesCache.get(seriesName)!;
      const { data: existingSeries } = await supabase
        .from("series")
        .select("id, image_url")
        .eq("category_id", categoryId)
        .eq("name", seriesName)
        .maybeSingle();
      if (existingSeries) {
        // 系列已經存在：如果它原本沒有圖片、而這次 Excel 有填，就順便補上
        if (seriesImageUrl && !existingSeries.image_url) {
          await supabase.from("series").update({ image_url: toDirectImageUrl(seriesImageUrl) }).eq("id", existingSeries.id);
        }
        seriesCache.set(seriesName, existingSeries.id);
        return existingSeries.id;
      }
      const { data: lastSeries } = await supabase.from("series").select("sort_order").eq("category_id", categoryId).order("sort_order", { ascending: false }).limit(1);
      const nextSeriesSort = lastSeries && lastSeries.length > 0 ? lastSeries[0].sort_order + 1 : 0;
      const { data: created, error: createErr } = await supabase
        .from("series")
        .insert({
          name: seriesName,
          category_id: categoryId,
          sort_order: nextSeriesSort,
          is_visible: true,
          image_url: seriesImageUrl ? toDirectImageUrl(seriesImageUrl) : null,
        })
        .select()
        .single();
      if (createErr || !created) throw new Error(`建立系列「${seriesName}」失敗：${createErr?.message || "未知錯誤"}`);
      seriesCache.set(seriesName, created.id);
      return created.id;
    }

    async function nextSortOrderFor(seriesId: string): Promise<number> {
      if (!sortOrderBySeriesId.has(seriesId)) {
        const { data: existing } = await supabase.from("products").select("sort_order").eq("series_id", seriesId).order("sort_order", { ascending: false }).limit(1);
        sortOrderBySeriesId.set(seriesId, existing && existing.length > 0 ? existing[0].sort_order + 1 : 0);
      }
      const current = sortOrderBySeriesId.get(seriesId)!;
      sortOrderBySeriesId.set(seriesId, current + 1);
      return current;
    }

    let success = 0;
    let created = 0;
    let updated = 0;
    const failed: string[] = [];
    const insertRows: any[] = [];
    // 封面圖是「系列 + 商品名稱」層級共用的，最後統一同步
    const coverImageByKey = new Map<string, { seriesId: string; name: string; coverUrl: string }>();
    const createdSeriesNames = new Set<string>();

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2; // 試算表第1列是標題，資料從第2列開始
      const seriesName = String(row["系列名稱"] ?? "").trim();
      const seriesImageUrl = String(row["系列圖片網址"] ?? "").trim();
      const name = String(row["商品名稱"] ?? "").trim();
      const style = String(row["款式"] ?? "").trim();
      const priceRaw = row["金額"];
      const shippingRaw = row["運費金額"];
      const discountRaw = String(row["是否滿減"] ?? "").trim().toLowerCase();
      const imageUrlRaw = String(row["圖片網址"] ?? "").trim();
      const coverImageUrlRaw = String(row["封面圖網址"] ?? "").trim();

      if (!seriesName) {
        failed.push(`第 ${rowNum} 列：缺少系列名稱，略過`);
        continue;
      }
      if (!name) {
        failed.push(`第 ${rowNum} 列：缺少商品名稱，略過`);
        continue;
      }
      const price = Number(priceRaw);
      if (!isFinite(price) || price < 0) {
        failed.push(`第 ${rowNum} 列：${name}${style ? `（${style}）` : ""} — 金額格式不正確，略過`);
        continue;
      }
      const shippingFee = shippingRaw === "" ? 0 : Number(shippingRaw);
      if (!isFinite(shippingFee) || shippingFee < 0) {
        failed.push(`第 ${rowNum} 列：${name}${style ? `（${style}）` : ""} — 運費金額格式不正確，略過`);
        continue;
      }

      let seriesId: string;
      try {
        const hadBefore = seriesCache.has(seriesName);
        seriesId = await resolveSeriesId(seriesName, seriesImageUrl);
        if (!hadBefore) createdSeriesNames.add(seriesName);
      } catch (e: any) {
        failed.push(`第 ${rowNum} 列：${e.message}`);
        continue;
      }

      const hasDiscountFlag = discountRaw === "v";
      const coverKey = `${seriesId}||${name}`;
      if (coverImageUrlRaw && !coverImageByKey.has(coverKey)) {
        coverImageByKey.set(coverKey, { seriesId, name, coverUrl: toDirectImageUrl(coverImageUrlRaw) });
      }

      // 同一個系列＋同商品名稱＋同款式視為同一筆商品：已存在就更新（用Excel的新資料覆蓋），不存在才新增
      const { data: existingProduct } = await supabase
        .from("products")
        .select("id")
        .eq("series_id", seriesId)
        .eq("name", name)
        .eq("style", style)
        .maybeSingle();

      if (existingProduct) {
        const updates: any = {
          price,
          shipping_fee: shippingFee,
          has_discount_flag: hasDiscountFlag,
        };
        // 圖片欄位留空時不覆蓋既有圖片（避免不小心把之前設定好的圖清掉）
        if (imageUrlRaw) updates.image_url = toDirectImageUrl(imageUrlRaw);
        const { error: updateErr } = await supabase.from("products").update(updates).eq("id", existingProduct.id);
        if (updateErr) {
          failed.push(`第 ${rowNum} 列：${name}${style ? `（${style}）` : ""} — 更新失敗：${updateErr.message}`);
          continue;
        }
        updated++;
      } else {
        insertRows.push({
          series_id: seriesId,
          name,
          style,
          price,
          shipping_fee: shippingFee,
          has_discount_flag: hasDiscountFlag,
          cod_allowed: true,
          image_url: imageUrlRaw ? toDirectImageUrl(imageUrlRaw) : null,
          sort_order: await nextSortOrderFor(seriesId),
        });
        created++;
      }
      success++;
    }

    if (insertRows.length > 0) {
      const { error } = await supabase.from("products").insert(insertRows);
      if (error) return NextResponse.json({ error: "寫入資料庫失敗：" + error.message }, { status: 500 });
    }

    // 封面圖統一同步到每個「系列＋商品名稱」底下的所有款式列
    for (const { seriesId, name, coverUrl } of coverImageByKey.values()) {
      await supabase.from("products").update({ cover_image_url: coverUrl }).eq("series_id", seriesId).eq("name", name);
    }

    return NextResponse.json({
      total: rows.length,
      success,
      created,
      updated,
      failed,
      seriesCount: seriesCache.size,
      seriesNames: Array.from(seriesCache.keys()),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "匯入失敗" }, { status: 500 });
  }
}
