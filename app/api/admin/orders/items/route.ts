import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

export const dynamic = "force-dynamic";

/**
 * 修改一張訂單的商品內容（改款式、改商品、改數量），僅限最高權限。
 * body: { orderNo, items: [{ name, style, qty }] }
 * 每個品項會用「企劃底下的商品目錄」去對到目前的單價（不是沿用訂單原本的舊單價），
 * 這樣改款式/改商品的時候價格才會正確；商品目錄裡找不到的品項會直接回錯誤，不會用 0 元硬存。
 * 這個 API 是整份取代訂單的商品明細（先刪光原本的、再依新清單重建），不是逐筆修改。
 */
export async function PATCH(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  // 一次結帳＝一張訂單、可跨系列，所以每個品項各自帶自己的系列
  const items: { name: string; style: string; qty: number; seriesId?: string }[] = Array.isArray(body.items) ? body.items : [];
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "訂單至少要有一項商品" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, series_id, campaign_id, campaigns(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  // 跨系列訂單的 orders.series_id 是空的（系列改記在品項層級），不能因此擋掉編輯

  // 商品目錄要涵蓋「這次送來的所有品項各自的系列」，不是只查訂單層級那一個
  const seriesIds = Array.from(
    new Set([...(order.series_id ? [order.series_id] : []), ...items.map((it) => it.seriesId).filter(Boolean)])
  ) as string[];
  if (seriesIds.length === 0) {
    return NextResponse.json({ error: "每個品項都要指定所屬系列" }, { status: 400 });
  }
  const { data: catalog } = await supabase
    .from("products")
    .select("name, style, price, image_url, series_id")
    .in("series_id", seriesIds);
  // key 要帶系列，不同系列可能有同名商品
  const catalogMap = new Map((catalog || []).map((p) => [`${p.series_id}|${p.name}|${p.style || ""}`, p]));

  // 系列名稱快照：編輯完要保留，不然拆單、成本表、Google Sheet 都會失去系列資訊
  const { data: seriesRows } = await supabase.from("series").select("id, name").in("id", seriesIds);
  const seriesNameById = new Map((seriesRows || []).map((s: any) => [s.id, s.name]));

  const newItemRows: { order_id: string; product_name: string; style: string; qty: number; unit_price: number; subtotal: number; image_url: string | null; series_id: string; series_name_snapshot: string }[] = [];
  for (const it of items) {
    const name = String(it.name || "").trim();
    const style = String(it.style || "").trim();
    const qty = Number(it.qty);
    if (!name || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `品項「${name || "(未命名)"}」的數量不正確` }, { status: 400 });
    }
    const rowSeriesId = String(it.seriesId || order.series_id || "");
    const product = catalogMap.get(`${rowSeriesId}|${name}|${style}`);
    if (!product) {
      const sname = seriesNameById.get(rowSeriesId) || "(未指定系列)";
      return NextResponse.json({ error: `系列「${sname}」的商品目錄裡找不到「${name}${style ? `（${style}）` : ""}」，請確認名稱/款式是否正確` }, { status: 400 });
    }
    const unitPrice = Number(product.price) || 0;
    newItemRows.push({
      order_id: order.id,
      product_name: name,
      style,
      qty,
      unit_price: unitPrice,
      subtotal: unitPrice * qty,
      image_url: product.image_url,
      series_id: rowSeriesId,
      series_name_snapshot: seriesNameById.get(rowSeriesId) || "",
    });
  }

  const { error: delErr } = await supabase.from("order_items").delete().eq("order_id", order.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("order_items").insert(newItemRows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const campaignName = (order as any).campaigns?.name;
  let syncWarning = "";
  if (order.campaign_id && campaignName) {
    try {
      await syncOrderRealtimeToPlanTab(order.campaign_id, campaignName);
      await syncOnePlanCostTab(order.campaign_id, campaignName);
    } catch (e: any) {
      syncWarning = "訂單商品內容已更新，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, syncWarning: syncWarning || undefined });
}
