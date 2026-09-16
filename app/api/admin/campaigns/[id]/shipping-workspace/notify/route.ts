import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { sendEmail, shipmentNoticeContent } from "@/lib/resend";

export const dynamic = "force-dynamic";

/**
 * 一次寄出到貨通知給多位顧客。
 * body: { shopUrl, picks: [{ orderId, type, id, qty }] }
 * 賣場網址每個檔期不一樣，每次都由店家當場填。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const shopUrl = String(body.shopUrl || "").trim();
  const picks: { orderId: string; type: "item" | "gift"; id: string; qty: number }[] = body.picks || [];
  if (!shopUrl) return NextResponse.json({ error: "請填寫賣場網址" }, { status: 400 });
  if (picks.length === 0) return NextResponse.json({ error: "請至少勾選一個品項" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("name").eq("id", params.id).maybeSingle();
  const campaignName = campaign?.name || "本檔期";

  const orderIds = Array.from(new Set(picks.map((p) => p.orderId)));
  const { data: orders } = await supabase
    .from("orders")
    .select("id, username, order_items(id, product_name, style), order_gift_selections(id, style_name_snapshot)")
    .in("id", orderIds);

  // 顧客信箱：訂單記的是暱稱，要去會員表查
  const usernames = (orders || []).map((o: any) => o.username);
  const { data: members } = usernames.length
    ? await supabase.from("members").select("username, email").in("username", usernames)
    : { data: [] };
  const emailByUsername = new Map((members || []).map((m: any) => [String(m.username).toLowerCase(), m.email]));

  let sentCount = 0;
  const failed: string[] = [];

  for (const orderId of orderIds) {
    const order = (orders || []).find((o: any) => o.id === orderId);
    if (!order) continue;
    const email = emailByUsername.get(String(order.username).toLowerCase());
    if (!email) {
      failed.push(`${order.username}（沒有登記信箱，可能是還沒認領的舊訂單）`);
      continue;
    }
    const rows = picks.filter((p) => p.orderId === orderId);
    const items = rows.map((r) => {
      if (r.type === "gift") {
        const g = (order as any).order_gift_selections?.find((x: any) => x.id === r.id);
        return { name: g?.style_name_snapshot || "滿贈", style: "", qty: r.qty, isGift: true };
      }
      const it = (order as any).order_items?.find((x: any) => x.id === r.id);
      return { name: it?.product_name || "", style: it?.style || "", qty: r.qty, isGift: false };
    });
    const { html, text } = shipmentNoticeContent(campaignName, items, shopUrl);
    try {
      await sendEmail(email, "米舖-官方周邊代購｜您訂購的商品已到貨", html, text);
      sentCount++;
    } catch (e: any) {
      failed.push(`${order.username}：${e?.message || "寄信失敗"}`);
    }
  }

  return NextResponse.json({ ok: true, sentCount, failed });
}
