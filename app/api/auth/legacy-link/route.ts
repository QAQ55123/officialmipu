import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";
import { syncOrderRealtimeToPlanTab, syncOnePlanCostTab } from "@/lib/planSheetSync";

/** 已經登入的會員，把一筆舊身份（跟底下的舊訂單）連結到目前這個帳號，不用另外註冊新帳號 */
export async function POST(req: Request) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const body = await req.json();
  const identityId = String(body.identityId || "").trim();
  if (!identityId) return NextResponse.json({ error: "缺少身份資訊，請重新操作一次" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: identity } = await supabase.from("legacy_identities").select("*").eq("id", identityId).maybeSingle();
  if (!identity) return NextResponse.json({ error: "找不到這筆身份資料，請重新操作一次" }, { status: 404 });
  if (identity.claimed_by_member_id) {
    if (identity.claimed_by_member_id === session.memberId) {
      return NextResponse.json({ error: "這筆資料已經連結到你的帳號了" }, { status: 409 });
    }
    return NextResponse.json({ error: "這筆資料已經被別的帳號連結過了" }, { status: 409 });
  }

  const { data: member } = await supabase.from("members").select("*").eq("id", session.memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: "帳號不存在，請重新登入" }, { status: 404 });

  // 標記身份已被目前帳號認領
  await supabase
    .from("legacy_identities")
    .update({ claimed_by_member_id: member.id, claimed_at: new Date().toISOString() })
    .eq("id", identity.id);

  // 把這個身份底下的舊訂單都改指定成目前帳號
  const { data: affectedOrders } = await supabase
    .from("orders")
    .update({ username: member.username, profile_url: member.profile_url, legacy_unmatched: false })
    .eq("legacy_identity_id", identity.id)
    .select("id, plan_id, plans(name)");

  // 同步受影響的企劃分頁到 Google Sheet
  const planMap = new Map<string, string>();
  for (const o of affectedOrders || []) {
    const planId = (o as any).plan_id;
    const planName = (o as any).plans?.name;
    if (planId && planName) planMap.set(planId, planName);
  }
  let syncWarning = "";
  for (const [planId, planName] of planMap) {
    try {
      await syncOrderRealtimeToPlanTab(planId, planName);
      await syncOnePlanCostTab(planId, planName);
    } catch (e: any) {
      syncWarning = "訂單已經轉移到你的帳號，但同步到 Google Sheet 時發生問題：" + (e?.message || "未知錯誤");
    }
  }

  return NextResponse.json({ ok: true, claimedOrders: (affectedOrders || []).length, syncWarning: syncWarning || undefined });
}
