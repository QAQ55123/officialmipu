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
  const items: { name: string; style: string; qty: number }[] = Array.isArray(body.items) ? body.items : [];
  if (!orderNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "訂單至少要有一項商品" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: order } = await supabase.from("orders").select("id, series_id, campaign_id, campaigns(name)").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  if (!order.series_id) return NextResponse.json({ error: "這張訂單沒有對應的系列，沒辦法修改商品內容" }, { status: 400 });

  // 用企劃目前的商品目錄，找出每個品項現在的正確單價（含圖片快照）
  const { data: catalog } = await supabase.from("products").select("name, style, price, image_url").eq("series_id", order.series_id);
  const catalogMap = new Map((catalog || []).map((p) => [`${p.name}|${p.style || ""}`, p]));

  const newItemRows: { order_id: string; product_name: string; style: string; qty: number; unit_price: number; subtotal: number; image_url: string | null }[] = [];
  for (const it of items) {
    const name = String(it.name || "").trim();
    const style = String(it.style || "").trim();
    const qty = Number(it.qty);
    if (!name || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `品項「${name || "(未命名)"}」的數量不正確` }, { status: 400 });
    }
    const product = catalogMap.get(`${name}|${style}`);
    if (!product) {
      return NextResponse.json({ error: `企劃的商品目錄裡找不到「${name}${style ? `（${style}）` : ""}」，請確認名稱/款式是否正確` }, { status: 400 });
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
