import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { genOrderNo, fmtMoney } from "@/lib/util";
import { notifyDiscord } from "@/lib/discord";
import { syncOrderToSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 新增訂單 */
export async function POST(req: Request) {
  const body = await req.json();
  const { planId, items, username, payment } = body; // items: [{ name, style, qty }]

  const supabase = getSupabaseAdmin();

  if (!planId) return NextResponse.json({ error: "缺少企劃" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "請至少選擇一項商品的數量" }, { status: 400 });
  }
  const finalUsername = String(username || "").trim();
  if (!finalUsername) return NextResponse.json({ error: "請先登入身分" }, { status: 400 });
  if (!["匯款", "取付"].includes(payment)) {
    return NextResponse.json({ error: "請先選擇交易方式（匯款 / 取付）" }, { status: 400 });
  }

  const { data: member } = await supabase.from("members").select("*").ilike("username", finalUsername).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到你的會員資料，請重新登入。" }, { status: 400 });
  if (!member.email_verified) {
    return NextResponse.json({ error: "請先驗證信箱後才能下單，可以到「編輯會員資料」重新寄送驗證信。" }, { status: 403 });
  }

  // 企劃 / 截止時間 / 取付上限
  const { data: plan, error: planErr } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (planErr || !plan) return NextResponse.json({ error: "找不到企劃" }, { status: 404 });
  if (plan.deadline && new Date(plan.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: `此企劃已截止，無法新增訂單。` }, { status: 400 });
  }

  // 價目表對照（避免前端竄改價格），順便記錄圖片快照
  const { data: products } = await supabase.from("products").select("*").eq("plan_id", planId);
  const priceMap: Record<string, number> = {};
  const imageMap: Record<string, string | null> = {};
  (products || []).forEach((p) => {
    priceMap[`${p.name}||${p.style || ""}`] = Number(p.price);
    imageMap[`${p.name}||${p.style || ""}`] = p.image_url || null;
  });

  let orderTotal = 0;
  const rows: { name: string; style: string; qty: number; unit: number; subtotal: number; imageUrl: string | null }[] = [];
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    const style = it.style || "";
    const unit = priceMap[`${it.name}||${style}`] ?? 0;
    const subtotal = qty * unit;
    orderTotal += subtotal;
    rows.push({ name: it.name, style, qty, unit, subtotal, imageUrl: imageMap[`${it.name}||${style}`] ?? null });
  }
  if (rows.length === 0) return NextResponse.json({ error: "請至少選擇一項商品的數量" }, { status: 400 });

  if (payment === "取付") {
    const codLimit = Number(plan.cod_limit) || 0;
    if (codLimit <= 0) return NextResponse.json({ error: "此企劃不提供取付，請改用匯款。" }, { status: 400 });

    // 取付上限是「這個顧客在這個企劃的累計金額」，不是單筆訂單，要把他之前已經下過的取付訂單也算進去
    const { data: priorOrders } = await supabase
      .from("orders")
      .select("order_items(subtotal)")
      .eq("plan_id", planId)
      .ilike("username", finalUsername)
      .eq("payment", "取付");
    const priorTotal = (priorOrders || []).reduce(
      (sum, o: any) => sum + (o.order_items || []).reduce((s: number, it: any) => s + (Number(it.subtotal) || 0), 0),
      0
    );

    if (priorTotal + orderTotal > codLimit) {
      const priorNote = priorTotal > 0 ? `（含你之前已經取付的 NT$ ${fmtMoney(priorTotal)}）` : "";
      return NextResponse.json(
        { error: `取付金額 NT$ ${fmtMoney(priorTotal + orderTotal)} 超過取付上限 NT$ ${fmtMoney(codLimit)}${priorNote}，請改用匯款或減少數量。` },
        { status: 400 }
      );
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
        plan_id: planId,
        plan_name_snapshot: plan.name,
        username: member.username,
        profile_url: member.profile_url,
        payment,
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
          { name: "企劃", value: plan.name, inline: true },
          { name: "金額", value: `NT$ ${fmtMoney(orderTotal)}`, inline: true },
          { name: "個人頁", value: member.profile_url },
          { name: "品項", value: lines || "(無)" },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });

  syncOrderToSheet({
    planId: plan.id,
    planName: plan.name,
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
    .select("*, plans(name, image_url, deadline, fulfillment_status, is_legacy_archive), order_items(*)")
    .ilike("username", username)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: (orders || []).map((o: any) => ({
      orderNo: o.order_no,
      planId: o.plan_id && !o.plans?.is_legacy_archive ? o.plan_id : null,
      planName: o.plan_name_snapshot || o.plans?.name || "（企劃已刪除）",
      planImage: o.plans?.image_url,
      username: o.username,
      payment: o.payment,
      paidStatus: o.paid_status,
      paidAmount: Number(o.paid_amount) || 0,
      createdAt: o.created_at,
      cancelRequested: !!o.cancel_requested_at,
      planClosed: o.plans?.deadline ? new Date(o.plans.deadline).getTime() < Date.now() : false,
      fulfillmentStatus: o.plans?.fulfillment_status || null,
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
