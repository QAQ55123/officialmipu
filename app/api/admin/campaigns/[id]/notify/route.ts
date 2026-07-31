import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";
import { sendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/admin/campaigns/:id/notify — 手動寄送到貨/開賣通知信給這個檔期所有訂單的顧客
 * body: { subject, body, shopLink }
 * body 內文可用 {檔期名稱} 佔位符，會自動換成實際名稱；提到「賣場」兩字會自動變成連結（若有填shopLink）
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const subject = String(body.subject || "").trim();
  const bodyText = String(body.body || "").trim();
  const shopLink = String(body.shopLink || "").trim();
  if (!subject || !bodyText) return NextResponse.json({ error: "請填寫信件標題與內文" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("id, name").eq("id", params.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const { data: orders } = await supabase.from("orders").select("member_id").eq("campaign_id", params.id);
  const memberIds = Array.from(new Set((orders || []).map((o) => o.member_id).filter(Boolean)));
  if (memberIds.length === 0) return NextResponse.json({ ok: true, sent: 0, failed: [] });

  const { data: members } = await supabase.from("members").select("email").in("id", memberIds).not("email", "is", null);
  const emails = Array.from(new Set((members || []).map((m) => m.email!)));

  const finalSubject = subject.replace(/\{檔期名稱\}/g, campaign.name);
  const finalBodyText = bodyText.replace(/\{檔期名稱\}/g, campaign.name);
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:sans-serif;font-size:15px;color:#2C2C2A;white-space:pre-wrap;">${finalBodyText
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
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
