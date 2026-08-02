import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";
import { sendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 手動寄送到貨/開賣通知信給某企劃底下所有訂單的顧客（不管取付/匯款、不排除取消審核中的，
 * 只要訂單還存在資料庫裡就算）。body: { planId, subject, body }
 * subject/body 是每次發送前，管理者自己編輯的內容；body 裡可以用 {企劃名稱} 這個佔位符，
 * 會自動換成實際企劃名稱。
 */
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
  const planId = String(body.planId || "").trim();
  const subject = String(body.subject || "").trim();
  const bodyText = String(body.body || "").trim();
  const shopLink = String(body.shopLink || "").trim();
  if (!planId) return NextResponse.json({ error: "缺少 planId" }, { status: 400 });
  if (!subject || !bodyText) return NextResponse.json({ error: "請填寫信件標題與內文" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: plan } = await supabase.from("plans").select("id, name").eq("id", planId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "找不到這個企劃" }, { status: 404 });

  const { data: orders } = await supabase.from("orders").select("username").eq("plan_id", planId);
  const usernames = Array.from(new Set((orders || []).map((o) => o.username).filter(Boolean)));
  if (usernames.length === 0) return NextResponse.json({ ok: true, sent: 0, failed: [] });

  const lowerUsernames = new Set(usernames.map((u) => u.toLowerCase()));
  const { data: members } = await supabase.from("members").select("username, email");
  const emails = Array.from(
    new Set(
      (members || [])
        .filter((m) => m.email && lowerUsernames.has(String(m.username).toLowerCase()))
        .map((m) => m.email as string)
    )
  );

  const finalSubject = subject.replace(/\{企劃名稱\}/g, plan.name);
  const finalBodyText = bodyText.replace(/\{企劃名稱\}/g, plan.name);
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:sans-serif;font-size:15px;color:#2C2C2A;white-space:pre-wrap;">${finalBodyText
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      // 內文裡的「賣場」兩字，如果有填賣場連結，就自動變成超連結
      return shopLink ? escaped.split("賣場").join(`<a href="${escapeHtml(shopLink)}" target="_blank" rel="noopener">賣場</a>`) : escaped;
    })
    .join("<br/>")}</div>`;

  let sent = 0;
  const failed: string[] = [];
  for (const email of emails) {
    try {
      await sendEmail(email, finalSubject, html, finalBodyText);
      sent++;
    } catch (e: any) {
      failed.push(`${email}：${e?.message || "未知錯誤"}`);
    }
    await sleep(300); // 節流，避免短時間內密集寄信被 Gmail 判定異常
  }

  return NextResponse.json({ ok: true, sent, failed });
}
