import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { money } from "@/lib/util";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 額外採購（跟其他賣家／管道補買的現貨，用來抵掉贈品缺口）。
 * 結構比照一般採購單：
 *   額外採購單 ─┬─ 款式明細（一張單可以買好幾個款式）
 *               └─ 廠商訂單編號 → 物流單號 → 物流單裡的款式（數量、到貨勾選）
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .select(
      "*, extra_purchase_items(id, gift_style_id, qty, subtotal, created_at, gift_styles(style_name, threshold_amount)), " +
        "extra_purchase_order_numbers(id, order_number, created_at, extra_purchase_shipments(id, tracking_number, weight_kg, created_at, extra_purchase_shipment_items(id, extra_purchase_item_id, qty, arrived)))"
    )
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byTime = (a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at));

  return NextResponse.json({
    extraPurchases: (data || []).map((p: any) => {
      const items = (p.extra_purchase_items || []).sort(byTime);
      const orderNumbers = (p.extra_purchase_order_numbers || []).sort(byTime).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        shipments: (o.extra_purchase_shipments || []).sort(byTime).map((s: any) => ({
          id: s.id,
          trackingNumber: s.tracking_number || "",
          weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
          items: (s.extra_purchase_shipment_items || []).map((si: any) => ({
            id: si.id,
            extraPurchaseItemId: si.extra_purchase_item_id,
            styleName:
              items.find((i: any) => i.id === si.extra_purchase_item_id)?.gift_styles?.style_name || "（款式已刪除）",
            qty: si.qty,
            arrived: !!si.arrived,
          })),
        })),
      }));

      // 每個款式：已經開到物流單上的數量、其中已到貨的數量
      const allShipmentItems = orderNumbers.flatMap((o: any) => o.shipments.flatMap((s: any) => s.items));
      const itemRows = items.map((i: any) => {
        const mine = allShipmentItems.filter((si: any) => si.extraPurchaseItemId === i.id);
        return {
          id: i.id,
          giftStyleId: i.gift_style_id,
          styleName: i.gift_styles?.style_name || "（款式已刪除）",
          thresholdAmount: i.gift_styles?.threshold_amount ?? null,
          qty: i.qty,
          subtotal: i.subtotal != null ? Number(i.subtotal) : null,
          trackedQty: mine.reduce((s: number, x: any) => s + x.qty, 0),
          arrivedQty: mine.filter((x: any) => x.arrived).reduce((s: number, x: any) => s + x.qty, 0),
        };
      });

      return {
        id: p.id,
        note: p.note,
        createdAt: p.created_at,
        orderNumber: orderNumbers.map((o: any) => o.orderNumber).join("、") || p.order_number || "",
        items: itemRows,
        orderNumbers,
        totalQty: itemRows.reduce((s: number, i: any) => s + i.qty, 0),
        arrivedQty: itemRows.reduce((s: number, i: any) => s + i.arrivedQty, 0),
        subtotal: money(itemRows.reduce((s: number, i: any) => s + (i.subtotal || 0), 0)),
      };
    }),
  });
}

/** POST body: { orderNumber, note, items: [{ giftStyleId, qty, subtotal }] } — 一張單可以一次買多個款式 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((it) => ({
      giftStyleId: String(it.giftStyleId || ""),
      qty: Number(it.qty),
      subtotal: it.subtotal === "" || it.subtotal == null ? null : money(Number(it.subtotal)),
    }))
    .filter((it) => it.giftStyleId);
  if (items.length === 0) return NextResponse.json({ error: "請至少填一個滿贈款式" }, { status: 400 });
  const bad = items.find((it) => !isFinite(it.qty) || it.qty <= 0);
  if (bad) return NextResponse.json({ error: "每個款式都要填正確的數量" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: purchase, error } = await supabase
    .from("vendor_extra_purchases")
    .insert({
      campaign_id: params.id,
      // 這三個是舊結構的欄位，保留給既有資料用，新資料改記在款式明細上
      gift_style_id: null,
      qty: items.reduce((s, it) => s + it.qty, 0),
      note: body.note || null,
      order_number: body.orderNumber || null,
      subtotal: money(items.reduce((s, it) => s + (it.subtotal || 0), 0)) || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: itemsErr } = await supabase.from("extra_purchase_items").insert(
    items.map((it) => ({ extra_purchase_id: purchase.id, gift_style_id: it.giftStyleId, qty: it.qty, subtotal: it.subtotal }))
  );
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  if (body.orderNumber) {
    await supabase.from("extra_purchase_order_numbers").insert({ extra_purchase_id: purchase.id, order_number: String(body.orderNumber) });
  }
  return NextResponse.json({ extraPurchase: purchase });
}
