import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

export const dynamic = "force-dynamic";

/**
 * 掃描疑似重複的訂單：只針對「舊資料匯入」建立的訂單（有 legacy_identity_id 或標記 legacy_unmatched 的），
 * 同一個人、同一個企劃底下，商品內容（名稱/款式/數量/單價）跟交易方式都一模一樣，很可能是同一份
 * 舊資料被重複匯入造成的。前台正常下單不在掃描範圍內，因為客人本來就可能真的買兩次一樣的東西。
 */
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_no, username, plan_id, plan_name_snapshot, payment, paid_amount, legacy_unmatched, legacy_identity_id, created_at, order_items(product_name, style, qty, unit_price)")
    .or("legacy_identity_id.not.is.null,legacy_unmatched.eq.true") // 只掃舊資料匯入來的訂單，前台正常下單不比對（客人本來就可能真的買兩次一樣的東西）
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, any[]>();
  for (const o of orders || []) {
    if (!o.plan_id) continue; // 沒有企劃關聯的訂單不比對
    const itemSig = (o.order_items || [])
      .map((it: any) => `${it.product_name}|${it.style}|${it.qty}|${it.unit_price}`)
      .sort()
      .join(";");
    if (!itemSig) continue; // 沒有商品明細的不比對
    // 一定要「同一個人」才算重複：同一個身份名冊 ID，或是帳號完全一樣（不分大小寫）。
    // 只是商品內容剛好一樣、但帳號不同的，是不同客人各自買了同款商品，不是重複匯入。
    const personKey = o.legacy_identity_id || `u:${String(o.username || "").toLowerCase()}`;
    const key = `${o.plan_id}::${personKey}::${o.payment}::${itemSig}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  const duplicateGroups = Array.from(groups.values())
    .filter((g) => g.length > 1)
    .map((g) => ({
      planName: g[0].plan_name_snapshot,
      orders: g.map((o, idx) => ({
        orderNo: o.order_no,
        username: o.username,
        payment: o.payment,
        paidAmount: Number(o.paid_amount) || 0,
        legacyUnmatched: o.legacy_unmatched,
        createdAt: o.created_at,
        items: (o.order_items || []).map((it: any) => ({ name: it.product_name, style: it.style, qty: it.qty })),
        suggestDelete: idx > 0, // 保留最早的一筆，其餘預設建議刪除
      })),
    }));

  return NextResponse.json({ duplicateGroups });
}

/** 刪除選定的重複訂單（僅限最高權限）body: { orderNos: string[] } */
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const orderNos: string[] = Array.isArray(body.orderNos) ? body.orderNos : [];
  if (orderNos.length === 0) return NextResponse.json({ error: "沒有選擇要刪除的訂單" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: toDelete } = await supabase.from("orders").select("id, plan_id, plans(name)").in("order_no", orderNos);
  const ids = (toDelete || []).map((o) => o.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  // 先記下受影響的企劃（可能一次刪掉好幾個不同企劃的重複訂單），刪除後逐一重新同步
  const planMap = new Map<string, string>();
  for (const o of toDelete || []) {
    const planName = (o as any).plans?.name;
    if (o.plan_id && planName) planMap.set(o.plan_id, planName);
  }

  await supabase.from("order_items").delete().in("order_id", ids);
  const { error } = await supabase.from("orders").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const syncWarnings: string[] = [];
  for (const [planId, planName] of planMap) {
    try {
      await syncOrderRealtimeToPlanTab(planId, planName);
      await syncOnePlanCostTab(planId, planName);
    } catch (e: any) {
      syncWarnings.push(`「${planName}」同步失敗：${e?.message || "未知錯誤"}`);
    }
  }

  return NextResponse.json({ ok: true, deleted: ids.length, syncWarning: syncWarnings.length ? syncWarnings.join("；") : undefined });
}
