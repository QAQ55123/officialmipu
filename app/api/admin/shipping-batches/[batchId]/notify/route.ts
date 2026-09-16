import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { sendEmail, shipmentNoticeContent } from "@/lib/resend";

export const dynamic = "force-dynamic";

/**
 * 通知顧客這一批貨到了。body: { shopUrl }
 * 賣場網址每次都由店家當場填（每個檔期的賣貨便連結都不一樣，不存在檔期設定裡）。
 */
export async function POST(req: Request, { params }: { params: { batchId: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const shopUrl = String(body.shopUrl || "").trim();
  if (!shopUrl) return NextResponse.json({ error: "請填寫賣場網址" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: batch } = await supabase
    .from("shipping_batches")
    .select("id, order_id, shipping_batch_items(qty, order_item_id, order_gift_selection_id)")
    .eq("id", params.batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "找不到這個出貨批次" }, { status: 404 });

  const { data: order } = await supabase
    .from("orders")
    .select("username, campaigns(name), order_items(id, product_name, style), order_gift_selections(id, style_name_snapshot)")
    .eq("id", batch.order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "找不到這張訂單" }, { status: 404 });

  // 顧客信箱：訂單記的是暱稱，要去會員表查信箱
  const { data: member } = await supabase
    .from("members")
    .select("email, email_verified")
    .ilike("username", order.username)
    .maybeSingle();
  if (!member?.email) {
    return NextResponse.json({ error: "這位顧客沒有登記信箱（可能是還沒認領的舊訂單），無法寄送通知" }, { status: 400 });
  }

  const items = (batch.shipping_batch_items || []).map((bi: any) => {
    if (bi.order_gift_selection_id) {
      const g = (order as any).order_gift_selections?.find((x: any) => x.id === bi.order_gift_selection_id);
      return { name: g?.style_name_snapshot || "滿贈", style: "", qty: bi.qty, isGift: true };
    }
    const it = (order as any).order_items?.find((x: any) => x.id === bi.order_item_id);
    return { name: it?.product_name || "", style: it?.style || "", qty: bi.qty, isGift: false };
  });

  const campaignName = (order as any).campaigns?.name || "本檔期";
  const { html, text } = shipmentNoticeContent(campaignName, items, shopUrl);

  try {
    await sendEmail(member.email, `米舖-官方周邊代購｜您訂購的商品已到貨`, html, text);
  } catch (e: any) {
    return NextResponse.json({ error: `寄信失敗：${e?.message || "未知錯誤"}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentTo: member.email });
}
