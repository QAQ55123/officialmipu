import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** 查詢某企劃的到貨通知信收件人（不管取付/匯款、也不排除取消審核中的，只要訂單還存在就算）
 *  ?planId=xxx */
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

  const { searchParams } = new URL(req.url);
  const planId = (searchParams.get("planId") || "").trim();
  if (!planId) return NextResponse.json({ error: "缺少 planId" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: plan } = await supabase.from("plans").select("id, name").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "找不到這個企劃" }, { status: 404 });

  const { data: orders } = await supabase.from("orders").select("username").eq("plan_id", planId);
  const usernames = Array.from(new Set((orders || []).map((o) => o.username).filter(Boolean)));

  if (usernames.length === 0) return NextResponse.json({ planName: plan.name, emailCount: 0, orderUsernameCount: 0 });

  const lowerUsernames = new Set(usernames.map((u) => u.toLowerCase()));
  const { data: members } = await supabase.from("members").select("username, email");
  const matched = new Set<string>();
  for (const m of members || []) {
    if (m.email && lowerUsernames.has(String(m.username).toLowerCase())) matched.add(m.email.toLowerCase());
  }

  return NextResponse.json({
    planName: plan.name,
    orderUsernameCount: usernames.length,
    emailCount: matched.size,
  });
}
