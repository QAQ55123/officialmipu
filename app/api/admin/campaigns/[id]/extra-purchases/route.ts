import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .select("*, gift_styles(style_name), extra_purchase_order_numbers(id, order_number, created_at, extra_purchase_shipments(id, tracking_number, qty, weight_kg, arrived, created_at))")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    extraPurchases: (data || []).map((p: any) => {
      // 到貨追蹤：訂單編號 → 物流單號（各自記數量、重量、有沒有到貨）
      const orderNumbers = (p.extra_purchase_order_numbers || [])
        .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
        .map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number,
          shipments: (o.extra_purchase_shipments || [])
            .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
            .map((s: any) => ({
              id: s.id,
              trackingNumber: s.tracking_number || "",
              qty: s.qty,
              weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
              arrived: !!s.arrived,
            })),
        }));
      const allShipments = orderNumbers.flatMap((o: any) => o.shipments);
      return {
        id: p.id,
        giftStyleId: p.gift_style_id,
        styleName: p.gift_styles?.style_name || "（款式已刪除）",
        qty: p.qty,
        note: p.note,
        orderNumber: orderNumbers.map((o: any) => o.orderNumber).join("、") || p.order_number || "",
        subtotal: p.subtotal != null ? Number(p.subtotal) : null,
        createdAt: p.created_at,
        orderNumbers,
        // 已經開到物流單上的數量（不能超過這筆額外採購的總數）、以及其中已到貨的數量
        trackedQty: allShipments.reduce((s: number, x: any) => s + x.qty, 0),
        arrivedQty: allShipments.filter((x: any) => x.arrived).reduce((s: number, x: any) => s + x.qty, 0),
      };
    }),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const giftStyleId = String(body.giftStyleId || "");
  const qty = Number(body.qty);
  if (!giftStyleId) return NextResponse.json({ error: "請選擇滿贈款式" }, { status: 400 });
  if (!isFinite(qty) || qty <= 0) return NextResponse.json({ error: "數量格式不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vendor_extra_purchases")
    .insert({
      campaign_id: params.id,
      gift_style_id: giftStyleId,
      qty,
      note: body.note || null,
      order_number: body.orderNumber || null,
      subtotal: body.subtotal !== undefined && body.subtotal !== "" ? Number(body.subtotal) : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 新增時有填訂單編號的話，一併建到到貨追蹤的訂單編號表，之後直接在那底下開物流單
  if (body.orderNumber) {
    await supabase.from("extra_purchase_order_numbers").insert({ extra_purchase_id: data.id, order_number: String(body.orderNumber) });
  }
  return NextResponse.json({ extraPurchase: data });
}
