/**
 * 採購單滿贈上限的共用計算。手動配置、換平台、品項移進移出都用這一份，
 * 不然各處算法不一致，就會出現「手動可以加到5個，但照規則只能拿3個」這種漏洞。
 *
 * 規則（跟顧客端、自動分配一致）：
 *   總量上限   = min(floor(採購單原幣小計 ÷ 基礎單位), 平台單筆總量上限)
 *   每款上限   = min(floor(採購單原幣小計 ÷ 該款門檻), 平台該款上限)
 */

export type BatchGiftContext = {
  platformId: string | null;
  subtotalOriginal: number;
  totalCap: number; // 這張採購單最多能配幾個滿贈（所有款式加總）
  styleCapByStyleId: Map<string, number | null>; // 平台每款上限（沒設定＝null）
};

export async function getBatchGiftContext(supabase: any, campaignId: string, batchId: string): Promise<BatchGiftContext> {
  const { data: batch } = await supabase.from("vendor_purchase_batches").select("platform_id").eq("id", batchId).maybeSingle();
  const platformId: string | null = batch?.platform_id || null;

  const { data: batchItems } = await supabase
    .from("vendor_purchase_batch_items")
    .select("qty, order_items(unit_price_original)")
    .eq("batch_id", batchId);
  // 浮點誤差會讓金額換算出的上限少一個，加總後要修掉
  const subtotalOriginal =
    Math.round(
      (batchItems || []).reduce((s: number, it: any) => s + (Number(it.order_items?.unit_price_original) || 0) * it.qty, 0) * 100
    ) / 100;

  const { data: campaign } = await supabase.from("campaigns").select("gift_base_unit").eq("id", campaignId).maybeSingle();
  const baseUnit = Number(campaign?.gift_base_unit) || 100;
  const amountBasedTotal = Math.floor(subtotalOriginal / baseUnit);

  let platformTotalCap = Infinity;
  const styleCapByStyleId = new Map<string, number | null>();
  if (platformId) {
    const { data: platform } = await supabase.from("vendor_platforms").select("order_gift_cap").eq("id", platformId).maybeSingle();
    const cap = Number(platform?.order_gift_cap) || 0;
    if (cap > 0) platformTotalCap = cap;
    const { data: styleCaps } = await supabase
      .from("vendor_platform_style_caps")
      .select("gift_style_id, per_style_cap")
      .eq("platform_id", platformId);
    (styleCaps || []).forEach((c: any) => styleCapByStyleId.set(c.gift_style_id, Number(c.per_style_cap)));
  }

  return {
    platformId,
    subtotalOriginal,
    totalCap: Math.max(0, Math.min(amountBasedTotal, platformTotalCap)),
    styleCapByStyleId,
  };
}

export function styleMaxFor(ctx: BatchGiftContext, giftStyleId: string, thresholdAmount: number): number {
  const amountBased = thresholdAmount > 0 ? Math.floor(ctx.subtotalOriginal / thresholdAmount) : 0;
  const platformCap = ctx.styleCapByStyleId.get(giftStyleId);
  return platformCap != null ? Math.min(amountBased, platformCap) : amountBased;
}

/**
 * 採購單的金額或平台變了之後，把已配置的滿贈重新夾回上限內。
 * 回傳調整說明（例如「某款式：3 → 2」），讓畫面能告訴店家哪些被自動調整了。
 */
export async function clampBatchGifts(supabase: any, campaignId: string, batchId: string): Promise<string[]> {
  const { data: gifts } = await supabase
    .from("vendor_purchase_batch_gifts")
    .select("id, gift_style_id, qty, gift_styles(style_name, threshold_amount)")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (!gifts || gifts.length === 0) return [];

  const ctx = await getBatchGiftContext(supabase, campaignId, batchId);
  const adjusted: string[] = [];

  // 沒有平台就沒有規則可以比對，全部清空
  if (!ctx.platformId) {
    await supabase.from("vendor_purchase_batch_gifts").delete().eq("batch_id", batchId);
    gifts.forEach((g: any) => adjusted.push(`${g.gift_styles?.style_name}：因為沒有指定平台，配置已清空`));
    return adjusted;
  }

  let runningTotal = 0;
  for (const g of gifts as any[]) {
    const threshold = Number(g.gift_styles?.threshold_amount) || 0;
    const styleMax = styleMaxFor(ctx, g.gift_style_id, threshold);
    const newQty = Math.max(0, Math.min(g.qty, styleMax, ctx.totalCap - runningTotal));
    if (newQty < g.qty) {
      if (newQty <= 0) await supabase.from("vendor_purchase_batch_gifts").delete().eq("id", g.id);
      else await supabase.from("vendor_purchase_batch_gifts").update({ qty: newQty }).eq("id", g.id);
      adjusted.push(`${g.gift_styles?.style_name}：${g.qty} → ${newQty}`);
    }
    runningTotal += newQty;
  }
  return adjusted;
}
