import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { resolveTxnRate, ceilToTwd, CampaignRates } from "@/lib/txnRate";
import { computeStyleLimits, picksFeasible } from "@/lib/giftQuota";
import { loadCampaignGiftRules, orderItemAmounts } from "@/lib/orderGiftContext";
import { syncOrderRealtimeToPlanTab } from "@/lib/planSheetSync";
import { scheduleCostSync } from "@/lib/costSync";

export const dynamic = "force-dynamic";

function authError(req: Request): NextResponse | null {
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
  return null;
}

async function loadOrder(supabase: any, orderNo: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, payment, wants_gift, campaign_id, campaigns(*), order_items(*), order_gift_selections(*)")
    .eq("order_no", orderNo)
    .maybeSingle();
  return order;
}

/** 每個滿贈款式已經被放進出貨批次的數量（這些不能再減少） */
async function batchedQtyByStyle(supabase: any, selections: any[]): Promise<{ byStyle: Record<string, number>; bySelection: Record<string, number>; batchNoByStyle: Record<string, number[]> }> {
  const byStyle: Record<string, number> = {};
  const bySelection: Record<string, number> = {};
  const batchNoByStyle: Record<string, number[]> = {};
  const selIds = selections.map((s) => s.id);
  if (selIds.length === 0) return { byStyle, bySelection, batchNoByStyle };
  const { data: rows } = await supabase
    .from("shipping_batch_items")
    .select("order_gift_selection_id, qty, shipping_batch_id")
    .in("order_gift_selection_id", selIds);
  // 出貨批次在訂單頁是用建立順序編號（第 1 批、第 2 批…），提示訊息用同樣的編號
  const orderId = selections[0]?.order_id;
  const { data: batches } = await supabase.from("shipping_batches").select("id, created_at").eq("order_id", orderId).order("created_at", { ascending: true });
  const batchNo = new Map<string, number>();
  (batches || []).forEach((b: any, i: number) => batchNo.set(b.id, i + 1));
  const styleBySel = new Map(selections.map((s) => [s.id, s.gift_style_id]));
  (rows || []).forEach((r: any) => {
    const styleId = styleBySel.get(r.order_gift_selection_id);
    const q = Number(r.qty) || 0;
    bySelection[r.order_gift_selection_id] = (bySelection[r.order_gift_selection_id] || 0) + q;
    if (styleId) {
      byStyle[styleId] = (byStyle[styleId] || 0) + q;
      const n = batchNo.get(r.shipping_batch_id);
      if (n) batchNoByStyle[styleId] = Array.from(new Set([...(batchNoByStyle[styleId] || []), n])).sort((a, b) => a - b);
    }
  });
  return { byStyle, bySelection, batchNoByStyle };
}

/** 切換「要不要滿贈」時，一般商品依新組合的匯率重算；滿贈系列、獨立網頁專用價的品項不動 */
function repriceItems(order: any, wantsGift: boolean): { rows: { id: string; unit: number; subtotal: number; rate: number }[]; error?: string } {
  const rows: { id: string; unit: number; subtotal: number; rate: number }[] = [];
  for (const it of order.order_items || []) {
    if (it.fx_rate == null || !(Number(it.unit_price_original) > 0)) continue;
    const { enabled, rate } = resolveTxnRate(
      (order.campaigns || {}) as CampaignRates,
      order.payment === "取付" ? "cod" : "bank",
      !!it.has_discount_flag_snapshot,
      wantsGift
    );
    if (!enabled || rate == null) {
      const combo = `${order.payment === "匯款" ? "匯款/無卡" : order.payment}・${it.has_discount_flag_snapshot ? "有滿減" : "無滿減"}・${wantsGift ? "有滿贈" : "無滿贈"}`;
      return { rows: [], error: `這個檔期沒有開放「${combo}」，「${it.product_name}${it.style ? `（${it.style}）` : ""}」無法重算金額` };
    }
    const unit = ceilToTwd(Number(it.unit_price_original), rate);
    rows.push({ id: it.id, unit, subtotal: unit * (Number(it.qty) || 0), rate });
  }
  return { rows };
}

function itemsTotal(order: any): number {
  return (order.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0);
}

/** GET：編輯畫面需要的資料（款式清單、目前選擇、已出貨數量、切換要不要滿贈後的金額） */
export async function GET(req: Request, { params }: { params: { orderNo: string } }) {
  const err = authError(req);
  if (err) return err;
  const supabase = getSupabaseAdmin();
  const order = await loadOrder(supabase, decodeURIComponent(params.orderNo));
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  if (!order.campaign_id) return NextResponse.json({ error: "這張訂單沒有對應的檔期，無法計算滿贈" }, { status: 400 });

  const giftRules = await loadCampaignGiftRules(supabase, order.campaign_id);
  const amounts = await orderItemAmounts(supabase, order.order_items || []);
  const selections = order.order_gift_selections || [];
  const picks: Record<string, number> = {};
  selections.forEach((s: any) => {
    if (s.gift_style_id) picks[s.gift_style_id] = (picks[s.gift_style_id] || 0) + (Number(s.qty) || 0);
  });
  const batched = await batchedQtyByStyle(supabase, selections);

  const currentTotal = itemsTotal(order);
  const wantsGift = order.wants_gift !== false;
  const toggled = repriceItems(order, !wantsGift);
  let toggledTotal: number | null = null;
  if (!toggled.error) {
    const newById = new Map(toggled.rows.map((r) => [r.id, r.subtotal]));
    toggledTotal = (order.order_items || []).reduce((s: number, it: any) => s + (newById.has(it.id) ? newById.get(it.id)! : Number(it.subtotal) || 0), 0);
  }

  return NextResponse.json({
    wantsGift,
    payment: order.payment,
    vendorCap: giftRules.vendorCap,
    styles: giftRules.styles,
    itemAmounts: amounts,
    originalSubtotal: amounts.reduce((s, a) => s + a, 0),
    picks,
    batchedByStyle: batched.byStyle,
    batchNoByStyle: batched.batchNoByStyle,
    currentTotal,
    toggledTotal,
    toggleError: toggled.error || null,
  });
}

/**
 * PUT：儲存滿贈。body: { wantsGift: boolean, picks: { [giftStyleId]: qty } }
 * - 數量照顧客結帳時同一套規則檢查，超過就擋
 * - 已經放進出貨批次的滿贈不能減少到比批次裡的數量還少
 * - 切換要不要滿贈時，一般商品依新組合的匯率重算金額（直接更新品項，不刪除重建，才不會弄斷採購單、出貨批次的關聯）
 * - 取付訂單金額變動時同步調整檔期的已用取付額度（後台修改不受上限限制）
 */
export async function PUT(req: Request, { params }: { params: { orderNo: string } }) {
  const err = authError(req);
  if (err) return err;
  const body = await req.json().catch(() => ({}));
  const newWantsGift = body.wantsGift !== false;
  const rawPicks: Record<string, number> = body.picks && typeof body.picks === "object" ? body.picks : {};

  const supabase = getSupabaseAdmin();
  const order = await loadOrder(supabase, decodeURIComponent(params.orderNo));
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });
  if (!order.campaign_id) return NextResponse.json({ error: "這張訂單沒有對應的檔期，無法計算滿贈" }, { status: 400 });

  const giftRules = await loadCampaignGiftRules(supabase, order.campaign_id);
  const styleById = new Map(giftRules.styles.map((s) => [s.id, s]));

  // 整理新的選擇：不要滿贈時全部清空
  const picks: Record<string, number> = {};
  if (newWantsGift) {
    for (const [styleId, q] of Object.entries(rawPicks)) {
      const n = Math.floor(Number(q) || 0);
      if (n < 0) return NextResponse.json({ error: "滿贈數量不能是負數" }, { status: 400 });
      if (n === 0) continue;
      if (!styleById.has(styleId)) return NextResponse.json({ error: "有滿贈款式不屬於這個檔期，請重新整理後再試" }, { status: 400 });
      picks[styleId] = n;
    }
  }

  // 1. 照規則檢查上限（跟顧客結帳同一套）
  const amounts = await orderItemAmounts(supabase, order.order_items || []);
  if (!picksFeasible(amounts, giftRules.vendorCap, picks, giftRules.rules)) {
    const { totalPossible } = computeStyleLimits(amounts, giftRules.vendorCap, {}, giftRules.rules);
    const wanted = Object.values(picks).reduce((s, v) => s + v, 0);
    const msg = wanted > totalPossible
      ? `可選總量只有 ${totalPossible} 個，目前選了 ${wanted} 個`
      : "這個滿贈組合超過款式上限，請調整後再試";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 2. 已經放進出貨批次的不能減少
  const selections = order.order_gift_selections || [];
  const batched = await batchedQtyByStyle(supabase, selections);
  for (const [styleId, q] of Object.entries(batched.byStyle)) {
    if ((picks[styleId] || 0) < q) {
      const name = styleById.get(styleId)?.styleName || selections.find((s: any) => s.gift_style_id === styleId)?.style_name_snapshot || "這個滿贈";
      const nos = (batched.batchNoByStyle[styleId] || []).map((n) => `第 ${n} 批`).join("、");
      return NextResponse.json({ error: `${name}已經在出貨批次${nos ? ` ${nos}` : ""}（${q} 個），請先把它移出批次，才能減少數量或取消滿贈` }, { status: 400 });
    }
  }
  // 款式已被刪除、但出貨批次還有的舊選擇（gift_style_id 是空的），不能動
  const orphanBatched = selections.filter((s: any) => !s.gift_style_id && (batched.bySelection[s.id] || 0) > 0);
  if (!newWantsGift && orphanBatched.length > 0) {
    return NextResponse.json({ error: `「${orphanBatched[0].style_name_snapshot}」已經在出貨批次裡，請先把它移出批次才能取消滿贈` }, { status: 400 });
  }

  // 3. 切換要不要滿贈：重算金額
  const oldWantsGift = order.wants_gift !== false;
  let repriced: { id: string; unit: number; subtotal: number; rate: number }[] = [];
  if (newWantsGift !== oldWantsGift) {
    const r = repriceItems(order, newWantsGift);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    repriced = r.rows;
  }

  // ---- 檢查都通過，開始寫入 ----
  for (const r of repriced) {
    const { error } = await supabase.from("order_items").update({ unit_price: r.unit, subtotal: r.subtotal, fx_rate: r.rate }).eq("id", r.id);
    if (error) return NextResponse.json({ error: "更新商品金額失敗：" + error.message }, { status: 500 });
  }
  if (newWantsGift !== oldWantsGift) {
    await supabase.from("orders").update({ wants_gift: newWantsGift }).eq("id", order.id);
  }
  // 取付訂單：金額差額同步到檔期已用額度（重算的都是一般商品，滿贈系列額度不受影響）
  let codNotice = "";
  if (order.payment === "取付" && repriced.length > 0) {
    const oldById = new Map<string, number>((order.order_items || []).map((it: any) => [it.id, Number(it.subtotal) || 0] as [string, number]));
    const diff = repriced.reduce((s, r) => s + r.subtotal - (oldById.get(r.id) || 0), 0);
    if (diff !== 0) {
      const { data: c } = await supabase.from("campaigns").select("cod_campaign_used, cod_campaign_cap").eq("id", order.campaign_id).maybeSingle();
      const newUsed = Math.max(0, (Number(c?.cod_campaign_used) || 0) + diff);
      await supabase.from("campaigns").update({ cod_campaign_used: newUsed }).eq("id", order.campaign_id);
      const cap = Number(c?.cod_campaign_cap) || 0;
      if (cap > 0 && newUsed > cap) codNotice = `檔期已用取付額度 NT$${newUsed}，已超過上限 NT$${cap}`;
    }
  }

  // 滿贈選擇：同款式的舊資料盡量沿用（出貨批次指向的那筆不能刪），多的加在第一筆、少的從沒出貨的先扣
  const selsByStyle = new Map<string, any[]>();
  selections.forEach((s: any) => {
    if (!s.gift_style_id) return;
    if (!selsByStyle.has(s.gift_style_id)) selsByStyle.set(s.gift_style_id, []);
    selsByStyle.get(s.gift_style_id)!.push(s);
  });
  const allStyleIds = new Set([...Array.from(selsByStyle.keys()), ...Object.keys(picks)]);
  for (const styleId of Array.from(allStyleIds)) {
    const target = picks[styleId] || 0;
    const rows = (selsByStyle.get(styleId) || []).map((s: any) => ({ id: s.id, qty: Number(s.qty) || 0, minQty: batched.bySelection[s.id] || 0 }));
    const current = rows.reduce((s, r) => s + r.qty, 0);
    if (target === current) continue;
    if (rows.length === 0) {
      const st = styleById.get(styleId)!;
      const { error } = await supabase.from("order_gift_selections").insert({
        order_id: order.id, gift_style_id: styleId, style_name_snapshot: st.styleName, image_url_snapshot: st.imageUrl, qty: target,
      });
      if (error) return NextResponse.json({ error: "新增滿贈失敗：" + error.message }, { status: 500 });
      continue;
    }
    if (target > current) {
      rows[0].qty += target - current;
    } else {
      let reduce = current - target;
      // 沒放進出貨批次的先扣
      for (const r of [...rows].sort((a, b) => a.minQty - b.minQty)) {
        if (reduce <= 0) break;
        const can = r.qty - r.minQty;
        const take = Math.min(can, reduce);
        r.qty -= take;
        reduce -= take;
      }
    }
    for (const r of rows) {
      if (r.qty <= 0) {
        await supabase.from("order_gift_selections").delete().eq("id", r.id);
      } else {
        await supabase.from("order_gift_selections").update({ qty: r.qty }).eq("id", r.id);
      }
    }
  }
  // 不要滿贈：款式已被刪除的舊選擇也一起清掉（上面已確認沒有在出貨批次裡）
  if (!newWantsGift) {
    const orphanIds = selections.filter((s: any) => !s.gift_style_id).map((s: any) => s.id);
    if (orphanIds.length > 0) await supabase.from("order_gift_selections").delete().in("id", orphanIds);
  }

  let syncWarning = "";
  const campaignName = order.campaigns?.name;
  if (campaignName) {
    try {
      await syncOrderRealtimeToPlanTab(order.campaign_id, campaignName);
      scheduleCostSync(order.campaign_id);
    } catch (e: any) {
      syncWarning = "滿贈已更新，但同步到 Google Sheet 失敗：" + (e?.message || "未知錯誤");
    }
  }
  return NextResponse.json({ ok: true, codNotice: codNotice || undefined, syncWarning: syncWarning || undefined });
}
