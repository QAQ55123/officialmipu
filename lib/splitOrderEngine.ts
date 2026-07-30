import { getSupabaseAdmin } from "@/lib/supabase";
import { splitIntoGroups, GiftableItem } from "@/lib/giftQuota";
import { bracketFor, orderQuotaForPlatform, styleMaxForPlatform, TierConfig, PlatformConfig } from "@/lib/vendorPlatform";

/**
 * 第3節拆單引擎：把該檔期所有顧客的訂單品項混在一起，
 * 用同一套 bin-packing 演算法（giftQuota.ts）拆成多張我方採購單。
 *
 * 這是一次「試算」，寫入一筆新的 vendor_purchase_batches（is_final=false），
 * 可以在檔期進行中隨時重新呼叫，產生新的試算批次，不影響先前已經手動調整過、
 * 標記為正式（is_final=true）的批次。
 */
export async function computeSplitOrderBatch(campaignId: string) {
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("gift_base_unit, vendor_order_gift_cap")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) throw new Error("找不到這個檔期");

  // 撈出這個檔期所有訂單品項（含所屬顧客、商品金額）
  const { data: orderItems, error: itemsError } = await supabase
    .from("order_items")
    .select("id, qty, unit_amount_original, order_id, orders!inner(campaign_id, member_id)")
    .eq("orders.campaign_id", campaignId);
  if (itemsError) throw new Error(itemsError.message);

  if (!orderItems || orderItems.length === 0) {
    throw new Error("這個檔期目前沒有任何訂單品項可以拆單");
  }

  // 單件商品金額不可切割：qty>1 展開成多個獨立單位
  const giftableItems: (GiftableItem & { orderItemId: string; memberId: string })[] = [];
  for (const oi of orderItems as any[]) {
    for (let i = 0; i < oi.qty; i++) {
      giftableItems.push({
        id: `${oi.id}-${i}`,
        amountTwd: oi.unit_amount_original, // 拆單金額用原幣，非台幣（與2.7一致）
        orderItemId: oi.id,
        memberId: oi.orders.member_id,
      });
    }
  }

  const baseUnit = campaign.gift_base_unit || 100;
  const vendorCap = campaign.vendor_order_gift_cap ?? Number.MAX_SAFE_INTEGER;
  const groups = splitIntoGroups(giftableItems, baseUnit, vendorCap);

  // 預設平台：取這個檔期第一個平台（若尚未設定任何平台，先建一個預設值方便操作）
  let { data: platforms } = await supabase
    .from("vendor_platforms")
    .select("id")
    .eq("campaign_id", campaignId)
    .order("id", { ascending: true })
    .limit(1);

  let defaultPlatformId: string | null = platforms?.[0]?.id ?? null;
  if (!defaultPlatformId) {
    const { data: created } = await supabase
      .from("vendor_platforms")
      .insert({ campaign_id: campaignId, name: "預設平台", order_gift_cap: vendorCap === Number.MAX_SAFE_INTEGER ? 5 : vendorCap })
      .select()
      .single();
    defaultPlatformId = created?.id ?? null;
  }

  const { data: batch, error: batchError } = await supabase
    .from("vendor_purchase_batches")
    .insert({ campaign_id: campaignId, is_final: false })
    .select()
    .single();
  if (batchError) throw new Error(batchError.message);

  for (const group of groups) {
    const { data: po, error: poError } = await supabase
      .from("vendor_purchase_orders")
      .insert({ batch_id: batch.id, platform_id: defaultPlatformId, adjustment_text: "" })
      .select()
      .single();
    if (poError) throw new Error(poError.message);

    // 把這組裡的獨立單位依 order_item 分組回去（同一個 order_item 可能因為 qty>1 被拆散到不同組，
    // 這裡用「這組裡這個 order_item 出現幾次」當作這筆的 qty）
    const countByOrderItem = new Map<string, { qty: number; memberId: string }>();
    for (const itemId of group.itemIds) {
      const giftable = giftableItems.find((g) => g.id === itemId)!;
      const existing = countByOrderItem.get(giftable.orderItemId);
      if (existing) {
        existing.qty += 1;
      } else {
        countByOrderItem.set(giftable.orderItemId, { qty: 1, memberId: giftable.memberId });
      }
    }

    const rows = Array.from(countByOrderItem.entries()).map(([orderItemId, info]) => {
      const oi = (orderItems as any[]).find((x) => x.id === orderItemId);
      return {
        purchase_order_id: po.id,
        order_item_id: orderItemId,
        customer_member_id: info.memberId,
        qty: info.qty,
        unit_amount: oi.unit_amount_original,
      };
    });

    const { error: rowsError } = await supabase.from("vendor_purchase_order_items").insert(rows);
    if (rowsError) throw new Error(rowsError.message);
  }

  return batch.id;
}
