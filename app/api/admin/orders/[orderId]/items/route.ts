import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * GET /api/admin/orders/:orderId/items
 * 回傳這張顧客訂單的每個品項（含滿贈），各自的到貨狀態；
 * 若某品項還沒到貨，附上「其他顧客有相同商品已到貨」的挪用候選清單
 */
export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase.from("orders").select("member_id, campaign_id").eq("id", params.orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  const { data: orderItems, error: itemsError } = await supabase
    .from("order_items")
    .select("id, qty, product_variant_id, product_variants(style_name, products(name))")
    .eq("order_id", params.orderId);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  async function arrivedQtyForVendorItems(vendorItemIds: string[]): Promise<number> {
    if (vendorItemIds.length === 0) return 0;
    const { data: shipmentItems } = await supabase
      .from("vendor_shipment_items")
      .select("purchase_order_item_id, vendor_shipments!inner(arrived)")
      .in("purchase_order_item_id", vendorItemIds)
      .eq("vendor_shipments.arrived", true);
    if (!shipmentItems || shipmentItems.length === 0) return 0;

    const { data: vendorItems } = await supabase
      .from("vendor_purchase_order_items")
      .select("id, qty")
      .in(
        "id",
        shipmentItems.map((si: any) => si.purchase_order_item_id)
      );
    return (vendorItems || []).reduce((s, v) => s + v.qty, 0);
  }

  const results = [];
  for (const oi of orderItems || []) {
    const { data: vendorItems } = await supabase
      .from("vendor_purchase_order_items")
      .select("id, qty, customer_member_id")
      .eq("order_item_id", oi.id);

    const myVendorItemIds = (vendorItems || []).map((v) => v.id);
    const arrivedQty = Math.min(await arrivedQtyForVendorItems(myVendorItemIds), oi.qty);
    const arrivalStatus: "arrived" | "partial" | "not_arrived" =
      arrivedQty >= oi.qty ? "arrived" : arrivedQty > 0 ? "partial" : "not_arrived";

    let candidates: { vendorItemId: string; customerName: string; qty: number }[] = [];
    if (arrivalStatus !== "arrived") {
      // 找同款式、其他顧客、已到貨的品項（挪用候選）
      const { data: sameVariantVendorItems } = await supabase
        .from("vendor_purchase_order_items")
        .select("id, qty, customer_member_id, order_items!inner(product_variant_id)")
        .eq("order_items.product_variant_id", oi.product_variant_id)
        .neq("customer_member_id", order.member_id);

      for (const vi of sameVariantVendorItems || []) {
        const arrivedQtyForThis = await arrivedQtyForVendorItems([vi.id]);
        if (arrivedQtyForThis <= 0) continue;

        const { data: customer } = await supabase.from("members").select("username").eq("id", vi.customer_member_id).maybeSingle();
        candidates.push({ vendorItemId: vi.id, customerName: customer?.username ?? "未知顧客", qty: vi.qty });
      }
    }

    results.push({
      orderItemId: oi.id,
      productName: (oi as any).product_variants?.products?.name ?? "",
      styleName: (oi as any).product_variants?.style_name ?? null,
      qty: oi.qty,
      arrivedQty,
      arrivalStatus,
      candidates,
      isGift: false,
    });
  }

  // 滿贈品項：目前的資料模型無法逐筆追蹤到貨（贈品歸屬綁在採購單而非個別顧客，
  // 是刻意的匯總設計，見規格書第3節），這裡誠實標示為「未逐筆追蹤」而不是假裝算出精確狀態，
  // 也不因此擋住勾選——由店家自行核對後台「贈品缺口總覽」再決定要不要出貨
  const { data: giftSelections } = await supabase
    .from("order_gift_selections")
    .select("id, qty, gift_styles(style_name)")
    .eq("order_id", params.orderId);

  for (const gs of giftSelections || []) {
    results.push({
      orderItemId: gs.id,
      productName: (gs as any).gift_styles?.style_name ?? "",
      styleName: null,
      qty: gs.qty,
      arrivedQty: null,
      arrivalStatus: "untracked" as const,
      candidates: [],
      isGift: true,
    });
  }

  return NextResponse.json({ memberId: order.member_id, items: results });
}
