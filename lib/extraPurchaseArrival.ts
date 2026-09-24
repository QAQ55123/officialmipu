/**
 * 額外採購的到貨數量與重量。額外採購買的都是滿贈款式，用來補贈品缺口，
 * 所以它到貨之後，出貨時的「滿贈可出貨數」要算進去；成本表的總重量也要算進去。
 *
 * 結構：額外採購單 → 款式明細；訂單編號 → 物流單 → 物流單裡的款式（到貨勾選在這一層）
 */

async function loadPurchases(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from("vendor_extra_purchases")
    .select(
      "id, gift_style_id, extra_purchase_items(id, gift_style_id), " +
        "extra_purchase_order_numbers(extra_purchase_shipments(weight_kg, qty, arrived, extra_purchase_shipment_items(extra_purchase_item_id, qty, arrived)))"
    )
    .eq("campaign_id", campaignId);
  return data || [];
}

/** 每個滿贈款式，額外採購已經到貨幾個 */
export async function extraArrivedByGiftStyle(supabase: any, campaignId: string): Promise<Map<string, number>> {
  const purchases = await loadPurchases(supabase, campaignId);
  const map = new Map<string, number>();
  purchases.forEach((p: any) => {
    const styleByItemId = new Map<string, string>(
      (p.extra_purchase_items || []).map((i: any) => [i.id, i.gift_style_id])
    );
    (p.extra_purchase_order_numbers || []).forEach((o: any) => {
      (o.extra_purchase_shipments || []).forEach((s: any) => {
        const sis = s.extra_purchase_shipment_items || [];
        if (sis.length > 0) {
          sis.forEach((si: any) => {
            if (!si.arrived) return;
            const styleId = styleByItemId.get(si.extra_purchase_item_id);
            if (styleId) map.set(styleId, (map.get(styleId) || 0) + (Number(si.qty) || 0));
          });
          return;
        }
        // 還沒搬移的舊資料：數量與到貨狀態記在物流單上，那時一張單只有一個款式
        if (s.arrived && p.gift_style_id) {
          map.set(p.gift_style_id, (map.get(p.gift_style_id) || 0) + (Number(s.qty) || 0));
        }
      });
    });
  });
  return map;
}

/** 額外採購所有物流單的重量加總（公斤） */
export async function extraShipmentWeightKg(supabase: any, campaignId: string): Promise<number> {
  const purchases = await loadPurchases(supabase, campaignId);
  return purchases.reduce(
    (total: number, p: any) =>
      total +
      (p.extra_purchase_order_numbers || []).reduce(
        (s: number, o: any) =>
          s + (o.extra_purchase_shipments || []).reduce((w: number, sh: any) => w + (Number(sh.weight_kg) || 0), 0),
        0
      ),
    0
  );
}
