import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";
import { loadCampaignShipping } from "@/lib/shippingAvailability";

export const dynamic = "force-dynamic";

/**
 * 出貨作業頁：列出這個檔期「至少有一件已到貨」的顧客（不管出貨了沒），同一位顧客的所有訂單合併成一張卡。
 * 每位顧客的所有品項都列出來（可出貨／未到貨／已出貨），店家才判斷得了這位顧客的東西到齊了沒。
 * 一件都還沒到的顧客不列出來，等之後到貨了會自動出現。
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  let data;
  try {
    // 到貨／已出貨的計算跟「建立出貨批次前的檢查」共用 lib/shippingAvailability.ts，全部分批讀完
    data = await loadCampaignShipping(supabase, params.id);
  } catch (e: any) {
    return NextResponse.json({ error: `讀取失敗：${e.message}` }, { status: 500 });
  }
  const { orders, arrivedByItem, shippedByItem, shippedByGift, arrivedByGiftStyle, batches, batchItems } = data;
  if (orders.length === 0) return NextResponse.json({ customers: [] });

  // 同一位顧客（帳號不分大小寫）在這個檔期的所有訂單合併成一張卡，跟賣貨便匯出的算法一致
  const customerKeyOf = (o: any) => String(o.username || "").trim().toLowerCase();
  const customerKeyByOrder = new Map<string, string>(orders.map((o: any) => [o.id, customerKeyOf(o)]));
  // 第幾批：以「顧客」為單位、依建立時間編號，跟賣貨便匯出的「N.0」對得起來
  const batchCountByCustomer = new Map<string, number>();
  const batchNoById = new Map<string, number>();
  batches.forEach((b: any) => {
    const key = customerKeyByOrder.get(b.order_id) || "";
    const n = (batchCountByCustomer.get(key) || 0) + 1;
    batchCountByCustomer.set(key, n);
    batchNoById.set(b.id, n);
  });
  // 每個品項在哪幾批出貨過
  const batchNosByItem = new Map<string, Set<number>>();
  const batchNosByGift = new Map<string, Set<number>>();
  batchItems.forEach((bi: any) => {
    const no = batchNoById.get(bi.shipping_batch_id);
    if (!no) return;
    const key = bi.order_item_id || bi.order_gift_selection_id;
    const map = bi.order_item_id ? batchNosByItem : batchNosByGift;
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(no);
  });

  // 每個滿贈款式還有多少到貨數可以分給顧客（依訂單順序先到先給）
  const giftStyleRemaining = new Map<string, number>(arrivedByGiftStyle);

  const perOrder = orders
    .map((o: any) => {
      // 每一件都列出來：ordered 訂購數、shipped 已出貨、shippable 已到貨可出貨、notArrived 還沒到
      const itemLines = (o.order_items || []).map((it: any) => {
        const ordered = Number(it.qty) || 0;
        const arrived = Math.min(ordered, arrivedByItem.get(it.id) || 0);
        const shipped = shippedByItem.get(it.id) || 0;
        return {
          type: "item" as const,
          id: it.id,
          orderId: o.id,
          orderNo: o.order_no,
          seriesName: it.series_name_snapshot || "",
          name: it.product_name,
          style: it.style || "",
          ordered,
          shipped,
          arrived,
          shippable: Math.max(0, arrived - shipped),
          notArrived: Math.max(0, ordered - Math.max(arrived, shipped)),
          overShipped: Math.max(0, shipped - arrived), // 已出貨超過到貨（例如重複建了批次）
          batchNos: Array.from(batchNosByItem.get(it.id) || []).sort((x, y) => x - y),
          isGift: false,
        };
      });

      // 滿贈品項比照一般商品，同樣可以被勾進出貨批次（運費算0）。
      // 採購單的滿贈只記款式、對不到是給哪位顧客的，所以依訂單順序把到貨數分配下去（先下單的先拿）
      const giftLines = (o.order_gift_selections || []).map((g: any) => {
        const ordered = Number(g.qty) || 0;
        const shipped = shippedByGift.get(g.id) || 0;
        const styleLeft = g.gift_style_id ? giftStyleRemaining.get(g.gift_style_id) ?? 0 : 0;
        const canTake = Math.min(ordered, styleLeft);
        if (g.gift_style_id) giftStyleRemaining.set(g.gift_style_id, styleLeft - canTake);
        return {
          type: "gift" as const,
          id: g.id,
          orderId: o.id,
          orderNo: o.order_no,
          seriesName: "",
          name: g.style_name_snapshot,
          style: "",
          ordered,
          shipped,
          arrived: canTake,
          shippable: Math.max(0, canTake - shipped),
          notArrived: Math.max(0, ordered - Math.max(canTake, shipped)),
          // 滿贈的到貨是依款式分配的，對不準是誰的；超過這位顧客自己選的數量才確定是重複出貨
          overShipped: Math.max(0, shipped - ordered),
          batchNos: Array.from(batchNosByGift.get(g.id) || []).sort((x, y) => x - y),
          isGift: true,
        };
      });

      const lines = [...itemLines, ...giftLines];
      const labelOf = (bi: any) => {
        if (bi.order_gift_selection_id) {
          const g = giftLines.find((x: any) => x.id === bi.order_gift_selection_id);
          return `滿贈 ${g?.name || ""}`;
        }
        const it = itemLines.find((x: any) => x.id === bi.order_item_id);
        return it ? `${it.seriesName ? `${it.seriesName} / ` : ""}${it.name}${it.style ? `（${it.style}）` : ""}` : "";
      };
      const shippedBatches = batches
        .filter((b: any) => b.order_id === o.id)
        .map((b: any) => ({
          id: b.id,
          orderId: o.id,
          orderNo: o.order_no,
          createdAt: b.created_at,
          batchNo: batchNoById.get(b.id) || 0,
          customerShippingFee: Number(b.customer_shipping_fee) || 0,
          myshipOrdered: !!b.myship_ordered,
          items: batchItems
            .filter((bi: any) => bi.shipping_batch_id === b.id)
            .map((bi: any) => ({ label: labelOf(bi), qty: bi.qty })),
        }));

      return { key: customerKeyOf(o), username: String(o.username || "").trim(), orderId: o.id, orderNo: o.order_no, lines, shippedBatches };
    });

  // 依顧客合併：所有訂單的品項都列出來（包括完全還沒到的訂單），「全部到齊」才是看這個人的全部東西
  const byCustomer = new Map<string, any>();
  perOrder.forEach((po: any) => {
    const cur = byCustomer.get(po.key) || { key: po.key, username: po.username, orders: [] as any[], lines: [] as any[], shippedBatches: [] as any[] };
    cur.orders.push({ orderId: po.orderId, orderNo: po.orderNo });
    cur.lines.push(...po.lines);
    cur.shippedBatches.push(...po.shippedBatches);
    byCustomer.set(po.key, cur);
  });

  const customers = Array.from(byCustomer.values())
    .map((c: any) => {
      c.shippedBatches.sort((x: any, y: any) => x.batchNo - y.batchNo);
      return {
        key: c.key,
        username: c.username,
        orders: c.orders,
        shippedBatchCount: c.shippedBatches.length,
        notArrivedCount: c.lines.reduce((sum: number, l: any) => sum + l.notArrived, 0),
        overShippedCount: c.lines.reduce((sum: number, l: any) => sum + l.overShipped, 0),
        lines: c.lines,
        items: c.lines.filter((l: any) => l.shippable > 0), // 可以勾選出貨的
        shippedBatches: c.shippedBatches,
      };
    })
    // 這個人任何一張訂單有東西到貨（或出過貨）就整個人列出來，沒到的訂單也一起顯示；一件都還沒到的人不列
    .filter((c: any) => c.lines.some((l: any) => l.arrived > 0 || l.shipped > 0));

  return NextResponse.json({ customers });
}
