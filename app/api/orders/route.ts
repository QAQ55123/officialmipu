import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { genOrderNo, fmtMoney } from "@/lib/util";
import { notifyDiscord } from "@/lib/discord";
import { syncOrderToSheet } from "@/lib/sheetsSync";
import { resolveTxnRate, ceilToTwd, CampaignRates } from "@/lib/txnRate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 新增訂單 */
export async function POST(req: Request) {
  const body = await req.json();
  const { seriesId, items, username, payment, wantsGift, giftSelections } = body; // items: [{ name, style, qty }]

  const supabase = getSupabaseAdmin();

  if (!seriesId) return NextResponse.json({ error: "缺少系列" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "請至少選擇一項商品的數量" }, { status: 400 });
  }
  const finalUsername = String(username || "").trim();
  if (!finalUsername) return NextResponse.json({ error: "請先登入身分" }, { status: 400 });
  if (!["匯款", "取付"].includes(payment)) {
    return NextResponse.json({ error: "請先選擇交易方式（匯款 / 取付）" }, { status: 400 });
  }
  const finalWantsGift = wantsGift !== false;

  const { data: member } = await supabase.from("members").select("*").ilike("username", finalUsername).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到你的會員資料，請重新登入。" }, { status: 400 });
  if (!member.email_verified) {
    return NextResponse.json({ error: "請先驗證信箱後才能下單，可以到「編輯會員資料」重新寄送驗證信。" }, { status: 403 });
  }

  // 系列 / 取付上限
  const { data: series, error: seriesErr } = await supabase.from("series").select("*").eq("id", seriesId).single();
  if (seriesErr || !series) return NextResponse.json({ error: "找不到系列" }, { status: 404 });

  // 2.5節：檔期是否開放中，這是最後一道防線（前端按鈕已經先擋過一次，這裡避免分頁停留太久後才送出）
  // 2.6節：一併把8種匯率設定抓出來，計價要用
  const nowIso = new Date().toISOString();
  const { data: openCampaigns } = await supabase
    .from("campaigns")
    .select("*")
    .lte("opens_at", nowIso)
    .gte("closes_at", nowIso)
    .limit(1);
  if (!openCampaigns || openCampaigns.length === 0) {
    return NextResponse.json({ error: "目前沒有開放中的檔期，暫時無法下單，請稍後再試" }, { status: 400 });
  }
  const campaign = openCampaigns[0];

  // 價目表對照（避免前端竄改價格），順便記錄圖片快照跟2.6/2.4節需要的滿減標記／取付開關
  const { data: products } = await supabase.from("products").select("*").eq("series_id", seriesId);
  const productMap: Record<string, { price: number; imageUrl: string | null; hasDiscountFlag: boolean; codAllowed: boolean }> = {};
  (products || []).forEach((p) => {
    productMap[`${p.name}||${p.style || ""}`] = {
      price: Number(p.price),
      imageUrl: p.image_url || null,
      hasDiscountFlag: !!p.has_discount_flag,
      codAllowed: p.cod_allowed !== false,
    };
  });

  // 2.4節：取付時，個別不開放取付的商品要擋住（列出品項讓顧客調整，不是整張訂單一起擋）
  if (payment === "取付") {
    const blockedNames: string[] = [];
    for (const it of items) {
      const p = productMap[`${it.name}||${it.style || ""}`];
      if (p && !p.codAllowed) blockedNames.push(`${it.name}${it.style ? `（${it.style}）` : ""}`);
    }
    if (blockedNames.length > 0) {
      return NextResponse.json(
        { error: `以下商品不開放取付，請改用匯款或從購物車移除：${blockedNames.join("、")}` },
        { status: 400 }
      );
    }
  }

  let orderTotal = 0;
  let anyDisabledCombo = false;
  const rows: { name: string; style: string; qty: number; unit: number; subtotal: number; imageUrl: string | null }[] = [];
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    const style = it.style || "";
    const p = productMap[`${it.name}||${style}`];
    if (!p) continue;

    const { enabled, rate } = resolveTxnRate(campaign as CampaignRates, payment === "取付" ? "cod" : "bank", p.hasDiscountFlag, finalWantsGift);
    if (!enabled || rate == null) {
      anyDisabledCombo = true;
      break;
    }
    const unit = ceilToTwd(p.price, rate);
    const subtotal = qty * unit;
    orderTotal += subtotal;
    rows.push({ name: it.name, style, qty, unit, subtotal, imageUrl: p.imageUrl });
  }
  if (anyDisabledCombo) return NextResponse.json({ error: "這個交易方式與滿贈組合目前未開放，請重新選擇" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "請至少選擇一項商品的數量" }, { status: 400 });

  if (payment === "取付") {
    // 2.4節：這是「檔期」層級的總上限，不是每單、也不是單一系列的上限
    if (campaign.cod_campaign_cap != null && Number(campaign.cod_campaign_cap) > 0) {
      const cap = Number(campaign.cod_campaign_cap);
      const used = Number(campaign.cod_campaign_used) || 0;
      if (used + orderTotal > cap) {
        return NextResponse.json(
          { error: `取付金額已超過本檔期設定的數量，請改用匯款或減少數量。` },
          { status: 400 }
        );
      }
    }
  }

  let order: any = null;
  let orderErr: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNo = genOrderNo();
    const result = await supabase
      .from("orders")
      .insert({
        order_no: orderNo,
        series_id: seriesId,
        series_name_snapshot: series.name,
        username: member.username,
        profile_url: member.profile_url,
        payment,
        campaign_id: campaign.id,
        wants_gift: finalWantsGift,
      })
      .select()
      .single();
    if (!result.error) {
      order = result.data;
      break;
    }
    orderErr = result.error;
    if (!result.error.message.includes("duplicate")) break; // 不是編號碰撞造成的錯誤就不用重試
  }
  if (!order) return NextResponse.json({ error: orderErr?.message || "訂單編號產生失敗，請再試一次" }, { status: 500 });

  const itemRows = rows.map((r) => ({
    order_id: order.id,
    product_name: r.name,
    style: r.style,
    qty: r.qty,
    unit_price: r.unit,
    subtotal: r.subtotal,
    image_url: r.imageUrl,
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  if (finalWantsGift && Array.isArray(giftSelections) && giftSelections.length > 0) {
    const giftStyleIds = giftSelections.map((g: any) => g.giftStyleId).filter(Boolean);
    const { data: giftStylesData } = await supabase.from("gift_styles").select("id, style_name").in("id", giftStyleIds);
    const nameById = new Map((giftStylesData || []).map((g: any) => [g.id, g.style_name]));
    const giftRows = giftSelections
      .filter((g: any) => Number(g.qty) > 0)
      .map((g: any) => ({
        order_id: order.id,
        gift_style_id: g.giftStyleId,
        style_name_snapshot: nameById.get(g.giftStyleId) || "",
        qty: Number(g.qty),
      }));
    if (giftRows.length > 0) {
      const { error: giftErr } = await supabase.from("order_gift_selections").insert(giftRows);
      if (giftErr) console.error("滿贈選擇儲存失敗：", giftErr.message);
    }
  }

  if (payment === "取付") {
    await supabase
      .from("campaigns")
      .update({ cod_campaign_used: (Number(campaign.cod_campaign_used) || 0) + orderTotal })
      .eq("id", campaign.id);
  }

  const lines = rows.map((r) => `• ${r.name}${r.style ? `（${r.style}）` : ""} x${r.qty} = NT$ ${fmtMoney(r.subtotal)}`).join("\n");
  notifyDiscord({
    username: "訂購通知",
    embeds: [
      {
        title: "🛒 有人喊單了！",
        color: 3447003,
        fields: [
          { name: "訂單編號", value: order.order_no, inline: true },
          { name: "交易方式", value: payment, inline: true },
          { name: "帳號", value: member.username, inline: true },
          { name: "系列", value: series.name, inline: true },
          { name: "金額", value: `NT$ ${fmtMoney(orderTotal)}`, inline: true },
          { name: "個人頁", value: member.profile_url },
          { name: "品項", value: lines || "(無)" },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });

  syncOrderToSheet({
    campaignId: campaign.id,
    campaignName: campaign.name,
  }).catch(() => {});

  return NextResponse.json({ ok: true, orderNo: order.order_no, count: rows.length, total: orderTotal });
}

/** 查詢歷史訂單：?username=... */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "請提供 username" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, series(name, image_url, is_legacy_archive), campaigns(fulfillment_status), order_items(*)")
    .ilike("username", username)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: (orders || []).map((o: any) => ({
      orderNo: o.order_no,
      seriesId: o.series_id && !o.series?.is_legacy_archive ? o.series_id : null,
      seriesName: o.series_name_snapshot || o.series?.name || "（系列已刪除）",
      planImage: o.series?.image_url,
      username: o.username,
      payment: o.payment,
      paidStatus: o.paid_status,
      paidAmount: Number(o.paid_amount) || 0,
      createdAt: o.created_at,
      cancelRequested: !!o.cancel_requested_at,
      fulfillmentStatus: o.campaigns?.fulfillment_status || null,
      items: (o.order_items || []).map((it: any) => ({
        name: it.product_name,
        style: it.style,
        qty: it.qty,
        unitPrice: Number(it.unit_price),
        subtotal: Number(it.subtotal),
        imageUrl: it.image_url,
      })),
      total: (o.order_items || []).reduce((s: number, it: any) => s + Number(it.subtotal), 0),
    })),
  });
}
