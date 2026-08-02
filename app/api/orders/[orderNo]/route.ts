import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** 編輯自己的訂單（items 空陣列＝取消整張） */
export async function PUT(req: Request, { params }: { params: { orderNo: string } }) {
  const body = await req.json();
  const { items, username } = body;
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase.from("orders").select("*, plans(*)").eq("order_no", params.orderNo).single();
  if (error || !order) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });

  // 身分驗證：帳號須相符
  if (!username || String(username).toLowerCase() !== String(order.username).toLowerCase()) {
    return NextResponse.json({ error: "身分驗證失敗，無法編輯此訂單" }, { status: 403 });
  }

  if (order.plans?.deadline && new Date(order.plans.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: "此企劃已截止，無法修改訂單" }, { status: 400 });
  }

  const { data: products } = await supabase.from("products").select("*").eq("plan_id", order.plan_id);
  const priceMap: Record<string, number> = {};
  (products || []).forEach((p) => { priceMap[`${p.name}||${p.style || ""}`] = Number(p.price); });

  const newRows = (items || [])
    .map((it: any) => {
      const qty = Number(it.qty) || 0;
      if (qty <= 0) return null;
      const style = it.style || "";
      const unit = priceMap[`${it.name}||${style}`] ?? 0;
      return { order_id: order.id, product_name: it.name, style, qty, unit_price: unit, subtotal: qty * unit };
    })
    .filter(Boolean);

  if (order.payment === "取付" && Number(order.plans?.cod_limit) > 0) {
    const total = newRows.reduce((s: number, r: any) => s + r.subtotal, 0);
    if (total > Number(order.plans.cod_limit)) {
      return NextResponse.json({ error: `取付金額超過上限 NT$ ${order.plans.cod_limit}` }, { status: 400 });
    }
  }

  await supabase.from("order_items").delete().eq("order_id", order.id);
  if (newRows.length > 0) {
    await supabase.from("order_items").insert(newRows);
  } else {
    // 沒有任何品項＝取消整張訂單
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ ok: true, canceled: true });
  }

  return NextResponse.json({ ok: true, count: newRows.length });
}

/** 申請取消訂單（需要最高管理者審核，且要在企劃截止前才能申請）body: { username } */
export async function PATCH(req: Request, { params }: { params: { orderNo: string } }) {
  const body = await req.json();
  const { username } = body;
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase.from("orders").select("*, plans(deadline)").eq("order_no", params.orderNo).single();
  if (error || !order) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });

  if (!username || String(username).toLowerCase() !== String(order.username).toLowerCase()) {
    return NextResponse.json({ error: "身分驗證失敗，無法申請取消此訂單" }, { status: 403 });
  }
  if (order.plans?.deadline && new Date(order.plans.deadline).getTime() < Date.now()) {
    return NextResponse.json({ error: "此企劃已截止，無法申請取消訂單" }, { status: 400 });
  }
  if (order.cancel_requested_at) {
    return NextResponse.json({ error: "已經申請過取消了，請等待審核" }, { status: 400 });
  }

  await supabase.from("orders").update({ cancel_requested_at: new Date().toISOString() }).eq("id", order.id);
  return NextResponse.json({ ok: true });
}
