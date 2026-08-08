import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { splitByDiscountTiers, type SplitPiece, type DiscountTier, type GiftValueRule } from "@/lib/purchaseSplit";

/**
 * 3.1/3.4節：自動最佳化拆單。只處理目前「未分配品項池」裡的品項（已經手動分配過的不會被動到），
 * 依折扣門檻貪婪分組（折扣門檻三平台共用同一份，分組結果跟平台無關）。
 * 修正：每組分好之後，真正比較所有平台能榨出的滿贈總價值，選價值最高的那個平台，
 * 不是固定丟給優先順序最高的單一平台——這才是規格書要求的跨平台決策。
 * 這仍然是近似演算法（貪婪法），不保證100%最優解，供店家事後手動微調。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  const { data: platforms } = await supabase
    .from("vendor_platforms")
    .select("id, name, order_gift_cap")
    .eq("campaign_id", params.id)
    .order("sort_order", { ascending: true });
  if (!platforms || platforms.length === 0) {
    return NextResponse.json({ error: "這個檔期還沒有設定任何平台，請先到「廠商規則設定」新增平台" }, { status: 400 });
  }

  // 拆單試算匯率與指定平台（用來把贈品台幣售價換算成原幣、取每款上限）
  const { data: campaignRow } = await supabase
    .from("campaigns")
    .select("split_calc_fx_rate, checkout_gift_platform_id, gift_base_unit")
    .eq("id", params.id)
    .maybeSingle();

  const { data: giftStyleRows } = await supabase.from("gift_styles").select("id, threshold_amount").eq("campaign_id", params.id);
  const giftStyles = (giftStyleRows || []).map((s) => ({ id: s.id, thresholdAmount: Number(s.threshold_amount) }));

  const platformIds = platforms.map((p) => p.id);
  const { data: styleCapRows } = platformIds.length
    ? await supabase.from("vendor_platform_style_caps").select("platform_id, gift_style_id, per_style_cap").in("platform_id", platformIds)
    : { data: [] };

  /**
   * 算出「某個金額，在某個平台底下，最多能榨出多少滿贈總量」——用這個當作跨平台比較的依據。
   * 三層限制要一起套用（跟顧客端 lib/giftQuota.ts 的規則一致）：
   *   ① 該組總量上限（廠商單筆上限）
   *   ② 該門檻的名額數 floor(組金額 ÷ 門檻)，同門檻的不同款式共用這批名額
   *   ③ 每款上限
   * 之前漏掉①②，同門檻的款式會各自算滿再相加，導致高估、選錯平台。
   */
  function giftValueForPlatform(amount: number, platformId: string, orderGiftCap: number): number {
    // ② 每個門檻在這一組能開幾個名額（同門檻款式共用）
    const slotsLeft = new Map<number, number>();
    for (const s of giftStyles) {
      if (s.thresholdAmount <= 0) continue;
      if (!slotsLeft.has(s.thresholdAmount)) slotsLeft.set(s.thresholdAmount, Math.floor(amount / s.thresholdAmount));
    }

    let total = 0;
    // 門檻低的先放（低門檻名額多，能塞滿比較多贈品）
    const sortedStyles = [...giftStyles].sort((a, b) => a.thresholdAmount - b.thresholdAmount);
    for (const s of sortedStyles) {
      if (s.thresholdAmount <= 0) continue;
      if (total >= orderGiftCap) break; // ① 該組總量上限
      const slots = slotsLeft.get(s.thresholdAmount) ?? 0;
      if (slots <= 0) continue;
      const cap = (styleCapRows || []).find((c: any) => c.platform_id === platformId && c.gift_style_id === s.id);
      const perStyleCap = cap ? cap.per_style_cap : Number.MAX_SAFE_INTEGER; // ③ 每款上限
      const give = Math.min(perStyleCap, slots, orderGiftCap - total);
      if (give <= 0) continue;
      total += give;
      slotsLeft.set(s.thresholdAmount, slots - give);
    }
    return total;
  }

  function pickBestPlatform(amount: number): { id: string; name: string; order_gift_cap: number } {
    let best = platforms![0];
    let bestValue = -1;
    for (const p of platforms!) {
      const value = giftValueForPlatform(amount, p.id, Number(p.order_gift_cap) || 0);
      if (value > bestValue) {
        bestValue = value;
        best = p;
      }
    }
    return best;
  }

  const { data: tierRows } = await supabase.from("vendor_discount_tiers").select("threshold_amount, discount_amount").eq("campaign_id", params.id);
  const tiers: DiscountTier[] = (tierRows || []).map((t) => ({ thresholdAmount: Number(t.threshold_amount), discountAmount: Number(t.discount_amount) }));

  // 撈未分配品項池（邏輯同 unassigned-items，這裡重複一次是因為要保留 order_item_id 才能展開成單件）
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_items(id, product_name, style, qty, unit_price_original, has_discount_flag_snapshot)")
    .eq("campaign_id", params.id);

  const orderItemIds: string[] = [];
  (orders || []).forEach((o: any) => (o.order_items || []).forEach((it: any) => orderItemIds.push(it.id)));

  const { data: allocated } = orderItemIds.length
    ? await supabase.from("vendor_purchase_batch_items").select("order_item_id, qty").in("order_item_id", orderItemIds)
    : { data: [] };
  const allocatedQtyByItem = new Map<string, number>();
  (allocated || []).forEach((a: any) => {
    allocatedQtyByItem.set(a.order_item_id, (allocatedQtyByItem.get(a.order_item_id) || 0) + a.qty);
  });

  const { data: giftProducts } = await supabase.from("products").select("name, style").not("linked_gift_style_id", "is", null);
  const giftProductKeys = new Set((giftProducts || []).map((p: any) => `${p.name}||${p.style || ""}`));

  // 展開成單件（不可切割的最小單位），同一個 order_item 多件會變成好幾個 piece，都標記同一個 order_item_id
  const pieces: SplitPiece[] = [];
  (orders || []).forEach((o: any) => {
    (o.order_items || []).forEach((it: any) => {
      if (giftProductKeys.has(`${it.product_name}||${it.style || ""}`)) return; // 滿贈系列賣出的不算進拆單池
      const allocatedQty = allocatedQtyByItem.get(it.id) || 0;
      const remaining = it.qty - allocatedQty;
      const unitAmount = Number(it.unit_price_original) || 0;
      for (let i = 0; i < remaining; i++) {
        pieces.push({ id: it.id, amount: unitAmount, hasDiscountFlag: !!it.has_discount_flag_snapshot });
      }
    });
  });

  if (pieces.length === 0) return NextResponse.json({ error: "沒有可以自動分配的品項（未分配品項池是空的）" }, { status: 400 });

  // 贈品估值：用「滿贈系列商品的台幣售價 ÷ 檔期設定的拆單試算匯率」換成原幣，
  // 才能跟折扣金額（原幣）放在一起比較，決定「合併拿折扣」還是「拆開多拿贈品」比較划算。
  const splitFxRate = Number(campaignRow?.split_calc_fx_rate) || 0;
  const { data: giftSaleProducts } = await supabase
    .from("products")
    .select("price, linked_gift_style_id")
    .not("linked_gift_style_id", "is", null);
  const twdValueByStyleId = new Map<string, number>();
  (giftSaleProducts || []).forEach((p: any) => {
    if (!p.linked_gift_style_id) return;
    const v = Number(p.price) || 0;
    // 同一個款式可能有多筆商品紀錄，取最大值當估值
    if (!twdValueByStyleId.has(p.linked_gift_style_id) || v > (twdValueByStyleId.get(p.linked_gift_style_id) || 0)) {
      twdValueByStyleId.set(p.linked_gift_style_id, v);
    }
  });

  // 依「指定的結帳平台」取每款上限；沒指定就取所有平台中最小的（最保守）
  const preferredPlatformId = campaignRow?.checkout_gift_platform_id || null;
  const giftRules: GiftValueRule[] = giftStyles
    .map((s) => {
      const twd = twdValueByStyleId.get(s.id) || 0;
      const valueOriginal = splitFxRate > 0 ? twd / splitFxRate : 0;
      const caps = (styleCapRows || []).filter((c: any) => c.gift_style_id === s.id);
      const cap = preferredPlatformId
        ? caps.find((c: any) => c.platform_id === preferredPlatformId)
        : null;
      const perStyleCap = cap
        ? cap.per_style_cap
        : caps.length > 0
          ? Math.min(...caps.map((c: any) => c.per_style_cap))
          : Number.MAX_SAFE_INTEGER;
      return { thresholdAmount: s.thresholdAmount, perStyleCap, valueOriginal };
    })
    .filter((r) => r.valueOriginal > 0);

  const topPlatformGiftCap = Number(platforms[0]?.order_gift_cap) || 0;
  const groups = splitByDiscountTiers(pieces, tiers, giftRules, topPlatformGiftCap);

  // 3.3節：自動分配滿贈。先算出各款式的缺口（顧客保底需求 − 已經配置掉的），
  // 缺最多的優先分配；缺口補完就停，剩餘名額留給店家自行決定（不自動配滿）。
  const { data: campaignOrders } = await supabase.from("orders").select("id").eq("campaign_id", params.id);
  const allOrderIds = (campaignOrders || []).map((o: any) => o.id);
  const { data: giftSelections } = allOrderIds.length
    ? await supabase.from("order_gift_selections").select("gift_style_id, qty").in("order_id", allOrderIds)
    : { data: [] };
  const promisedByStyle = new Map<string, number>();
  (giftSelections || []).forEach((s: any) => {
    if (!s.gift_style_id) return;
    promisedByStyle.set(s.gift_style_id, (promisedByStyle.get(s.gift_style_id) || 0) + s.qty);
  });
  // 「當商品賣出去的滿贈」一樣要跟廠商拿貨，也要算進保底
  const { data: giftSaleProductsForGap } = await supabase
    .from("products")
    .select("name, style, linked_gift_style_id")
    .not("linked_gift_style_id", "is", null);
  if (giftSaleProductsForGap && giftSaleProductsForGap.length > 0 && allOrderIds.length > 0) {
    const styleIdByKey = new Map(giftSaleProductsForGap.map((p: any) => [`${p.name}||${p.style || ""}`, p.linked_gift_style_id]));
    const { data: soldItems } = await supabase.from("order_items").select("product_name, style, qty").in("order_id", allOrderIds);
    (soldItems || []).forEach((it: any) => {
      const sid = styleIdByKey.get(`${it.product_name}||${it.style || ""}`);
      if (!sid) return;
      promisedByStyle.set(sid, (promisedByStyle.get(sid) || 0) + it.qty);
    });
  }
  // 既有採購單已經配置掉的數量
  const { data: existingBatches } = await supabase.from("vendor_purchase_batches").select("id").eq("campaign_id", params.id);
  const existingBatchIds = (existingBatches || []).map((b: any) => b.id);
  const { data: existingGifts } = existingBatchIds.length
    ? await supabase.from("vendor_purchase_batch_gifts").select("gift_style_id, qty").in("batch_id", existingBatchIds)
    : { data: [] };
  const remainingGapByStyle = new Map<string, number>();
  promisedByStyle.forEach((qty, styleId) => remainingGapByStyle.set(styleId, qty));
  (existingGifts || []).forEach((g: any) => {
    remainingGapByStyle.set(g.gift_style_id, (remainingGapByStyle.get(g.gift_style_id) || 0) - g.qty);
  });

  let createdCount = 0;
  let assignedGiftCount = 0;
  const platformUsage = new Map<string, number>();
  for (const g of groups) {
    const bestPlatform = pickBestPlatform(g.groupAmount);
    const { data: batch, error: batchErr } = await supabase
      .from("vendor_purchase_batches")
      .insert({ campaign_id: params.id, platform_id: bestPlatform.id, label: "自動分配" })
      .select()
      .single();
    if (batchErr || !batch) continue;

    // 同一組裡，同一個 order_item_id 出現好幾個 piece，要合併成一筆 qty 加總的分配紀錄
    const qtyByOrderItem = new Map<string, number>();
    g.pieceIds.forEach((id) => qtyByOrderItem.set(id, (qtyByOrderItem.get(id) || 0) + 1));
    const itemRows = Array.from(qtyByOrderItem.entries()).map(([orderItemId, qty]) => ({
      batch_id: batch.id,
      order_item_id: orderItemId,
      qty,
    }));
    await supabase.from("vendor_purchase_batch_items").insert(itemRows);
    createdCount++;
    platformUsage.set(bestPlatform.name, (platformUsage.get(bestPlatform.name) || 0) + 1);

    // 這張採購單能配多少滿贈。總量上限 = min(floor(組金額 ÷ 基礎單位), 平台單筆上限)——
    // 這一層之前漏掉了，只用平台固定上限去擋，導致金額不足的採購單也被配滿
    // （例：359元、基礎100 → floor(359/100)=3 才對，卻用平台上限5去擋而配出4個）。
    const giftBaseUnit = Number(campaignRow?.gift_base_unit) || 100;
    const platformGiftCap = Math.min(
      Math.floor(g.groupAmount / giftBaseUnit),
      Number(bestPlatform.order_gift_cap) || 0
    );
    if (platformGiftCap > 0) {
      const slotsLeft = new Map<number, number>();
      giftStyles.forEach((s) => {
        if (s.thresholdAmount <= 0) return;
        if (!slotsLeft.has(s.thresholdAmount)) slotsLeft.set(s.thresholdAmount, Math.floor(g.groupAmount / s.thresholdAmount));
      });

      let placedInBatch = 0;
      const giftRowsToInsert: any[] = [];
      // 依「目前還缺多少」由大到小排序，缺最多的先分配
      const stylesByGap = [...giftStyles].sort(
        (a, b) => (remainingGapByStyle.get(b.id) || 0) - (remainingGapByStyle.get(a.id) || 0)
      );
      for (const s of stylesByGap) {
        if (placedInBatch >= platformGiftCap) break;
        const gap = remainingGapByStyle.get(s.id) || 0;
        if (gap <= 0) continue; // 這個款式已經不缺了，不再配（剩餘名額留給店家自己決定）
        const slots = slotsLeft.get(s.thresholdAmount) ?? 0;
        if (slots <= 0) continue;
        const cap = (styleCapRows || []).find((c: any) => c.platform_id === bestPlatform.id && c.gift_style_id === s.id);
        const perStyleCap = cap ? cap.per_style_cap : Number.MAX_SAFE_INTEGER;
        const give = Math.min(gap, slots, perStyleCap, platformGiftCap - placedInBatch);
        if (give <= 0) continue;
        giftRowsToInsert.push({ batch_id: batch.id, gift_style_id: s.id, qty: give });
        placedInBatch += give;
        assignedGiftCount += give;
        slotsLeft.set(s.thresholdAmount, slots - give);
        remainingGapByStyle.set(s.id, gap - give);
      }
      if (giftRowsToInsert.length > 0) {
        await supabase.from("vendor_purchase_batch_gifts").insert(giftRowsToInsert);
      }
    }
  }

  const platformSummary = Array.from(platformUsage.entries()).map(([name, count]) => `${name} x${count}張`).join("、");
  return NextResponse.json({ ok: true, createdBatchCount: createdCount, platformSummary, assignedGiftCount });
}
