/**
 * 額外採購的到貨數量與重量。額外採購買的都是滿贈款式，用來補贈品缺口，
 * 所以它到貨之後，出貨時的「滿贈可出貨數」要算進去；成本表的總重量也要算進去。
 */

async function loadExtraShipments(supabase: any, campaignId: string) {
  const { data } = await supabase
    .from("vendor_extra_purchases")
    .select("gift_style_id, extra_purchase_order_numbers(extra_purchase_shipments(qty, weight_kg, arrived))")
    .eq("campaign_id", campaignId);
  return (data || []).flatMap((p: any) =>
    (p.extra_purchase_order_numbers || []).flatMap((o: any) =>
      (o.extra_purchase_shipments || []).map((s: any) => ({ giftStyleId: p.gift_style_id as string | null, ...s }))
    )
  );
}

/** 每個滿贈款式，額外採購已經到貨幾個 */
export async function extraArrivedByGiftStyle(supabase: any, campaignId: string): Promise<Map<string, number>> {
  const rows = await loadExtraShipments(supabase, campaignId);
  const map = new Map<string, number>();
  rows.forEach((s: any) => {
    if (!s.arrived || !s.giftStyleId) return;
    map.set(s.giftStyleId, (map.get(s.giftStyleId) || 0) + (Number(s.qty) || 0));
  });
  return map;
}

/** 額外採購所有物流單的重量加總（公斤） */
export async function extraShipmentWeightKg(supabase: any, campaignId: string): Promise<number> {
  const rows = await loadExtraShipments(supabase, campaignId);
  return rows.reduce((s: number, x: any) => s + (Number(x.weight_kg) || 0), 0);
}
