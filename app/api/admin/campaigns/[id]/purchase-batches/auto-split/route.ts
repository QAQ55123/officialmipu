import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { splitByDiscountTiers, type SplitPiece, type DiscountTier } from "@/lib/purchaseSplit";

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

  const { data: giftStyleRows } = await supabase.from("gift_styles").select("id, threshold_amount").eq("campaign_id", params.id);
  const giftStyles = (giftStyleRows || []).map((s) => ({ id: s.id, thresholdAmount: Number(s.threshold_amount) }));

  const platformIds = platforms.map((p) => p.id);
  const { data: styleCapRows } = platformIds.length
    ? await supabase.from("vendor_platform_style_caps").select("platform_id, gift_style_id, per_style_cap").in("platform_id", platformIds)
    : { data: [] };

  // 算出「某個金額，在某個平台底下，最多能榨出多少滿贈總量」——用這個當作跨平台比較的依據
  function giftValueForPlatform(amount: number, platformId: string, orderGiftCap: number): number {
    let total = 0;
    for (const s of giftStyles) {
      if (s.thresholdAmount <= 0) continue;
      const amountBasedMax = Math.floor(amount / s.thresholdAmount);
      if (amountBasedMax <= 0) continue;
      const cap = (styleCapRows || []).find((c: any) => c.platform_id === platformId && c.gift_style_id === s.id);
      const effectiveMax = cap ? Math.min(amountBasedMax, cap.per_style_cap) : amountBasedMax;
      total += effectiveMax;
    }
    return Math.min(total, orderGiftCap);
  }

  function pickBestPlatform(amount: number): { id: string; name: string } {
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
    .select("id, order_items(id, product_name, style, qty, unit_price_original)")
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
        pieces.push({ id: it.id, amount: unitAmount });
      }
    });
  });

  if (pieces.length === 0) return NextResponse.json({ error: "沒有可以自動分配的品項（未分配品項池是空的）" }, { status: 400 });

  const groups = splitByDiscountTiers(pieces, tiers);

  let createdCount = 0;
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
  }

  const platformSummary = Array.from(platformUsage.entries()).map(([name, count]) => `${name} x${count}張`).join("、");
  return NextResponse.json({ ok: true, createdBatchCount: createdCount, platformSummary });
}
