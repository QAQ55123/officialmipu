import { runInBackground } from "@/lib/background";
import { syncCampaignCostSheet } from "@/lib/sheetsSync";

/**
 * 後台改了會影響成本表的資料（付款、訂單、出貨批次、物流重量、額外採購…）之後呼叫：
 * 在背景只重寫「這一個檔期」的成本表並更新總覽，不讓後台操作等它跑完。
 */
export function scheduleCostSync(campaignId: string | null | undefined) {
  if (!campaignId) return;
  runInBackground("成本表自動同步", () => syncCampaignCostSheet(campaignId));
}

/** 廠商訂單編號 → 所屬檔期 */
export async function campaignIdOfVendorOrderNumber(supabase: any, orderNumberId: string): Promise<string | null> {
  const { data } = await supabase
    .from("vendor_order_numbers")
    .select("vendor_purchase_batches(campaign_id)")
    .eq("id", orderNumberId)
    .maybeSingle();
  return (data as any)?.vendor_purchase_batches?.campaign_id || null;
}

/** 物流單 → 所屬檔期 */
export async function campaignIdOfShipment(supabase: any, shipmentId: string): Promise<string | null> {
  const { data } = await supabase.from("vendor_shipments").select("vendor_order_number_id").eq("id", shipmentId).maybeSingle();
  if (!data?.vendor_order_number_id) return null;
  return campaignIdOfVendorOrderNumber(supabase, data.vendor_order_number_id);
}

/** 訂單編號 → 所屬檔期 */
export async function campaignIdOfOrderNo(supabase: any, orderNo: string): Promise<string | null> {
  const { data } = await supabase.from("orders").select("campaign_id").eq("order_no", orderNo).maybeSingle();
  return data?.campaign_id || null;
}
