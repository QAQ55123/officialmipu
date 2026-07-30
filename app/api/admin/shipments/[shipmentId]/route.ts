import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

/**
 * PATCH /api/admin/shipments/:shipmentId
 * body: { arrived: boolean }
 *
 * 標記到貨時，依這批貨裡每個商品款式（product_variant_id）的到貨數量，
 * 優先自動配對給該款式最早產生的欠貨紀錄（backorders），
 * 依序補齊；數量不夠補齊全部就補到哪算哪，剩下的欠貨紀錄留待下次到貨。
 */
export async function PATCH(req: Request, { params }: { params: { shipmentId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const arrived = !!body.arrived;
  const supabase = getSupabaseAdmin();

  const { data: shipment, error: shipmentError } = await supabase
    .from("vendor_shipments")
    .update({ arrived })
    .eq("id", params.shipmentId)
    .select()
    .single();
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });

  let backorderFulfillments: any[] = [];

  if (arrived) {
    // 撈這批貨裡每筆一般商品品項（滿贈品項不需要走欠貨邏輯，欠貨只發生在跨顧客挪用「一般商品」的情境）
    const { data: shipmentItems } = await supabase
      .from("vendor_shipment_items")
      .select("purchase_order_item_id")
      .eq("shipment_id", params.shipmentId)
      .not("purchase_order_item_id", "is", null);

    const itemIds = (shipmentItems || []).map((si) => si.purchase_order_item_id).filter(Boolean) as string[];
    if (itemIds.length > 0) {
      const { data: poItems } = await supabase
        .from("vendor_purchase_order_items")
        .select("qty, order_items(product_variant_id)")
        .in("id", itemIds);

      // 依商品款式加總這批的到貨數量
      const arrivedQtyByVariant = new Map<string, number>();
      for (const it of poItems || []) {
        const variantId = (it as any).order_items?.product_variant_id;
        if (!variantId) continue;
        arrivedQtyByVariant.set(variantId, (arrivedQtyByVariant.get(variantId) || 0) + it.qty);
      }

      for (const [variantId, arrivedQty] of arrivedQtyByVariant.entries()) {
        let remaining = arrivedQty;

        const { data: backorders } = await supabase
          .from("backorders")
          .select("*")
          .eq("product_variant_id", variantId)
          .eq("fulfilled", false)
          .order("created_at", { ascending: true });

        for (const b of backorders || []) {
          if (remaining <= 0) break;
          if (remaining >= b.qty) {
            await supabase.from("backorders").update({ fulfilled: true }).eq("id", b.id);
            remaining -= b.qty;
            backorderFulfillments.push({ backorderId: b.id, fulfilledQty: b.qty, fullyFulfilled: true });
          } else {
            // 到貨數量不足以補齊這筆欠貨：先扣減欠貨數量，剩下的留著
            await supabase.from("backorders").update({ qty: b.qty - remaining }).eq("id", b.id);
            backorderFulfillments.push({ backorderId: b.id, fulfilledQty: remaining, fullyFulfilled: false });
            remaining = 0;
          }
        }
      }
    }
  }

  return NextResponse.json({ shipment, backorderFulfillments });
}
