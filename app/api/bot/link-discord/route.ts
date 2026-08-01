import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireBotSecret } from "@/lib/botAuth";
import { syncMembersSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";

/**
 * 給 Discord 喊單 Bot 用：把發文者的 Discord 帳號記錄到訂單所屬的會員資料（寫進資料庫，
 * 不是寫 Sheet，之後同步不會被洗掉）。
 * body: { orderNo, discordUserId, discordUsername }
 * 回傳 status："ok"（已寫入）｜"wrong_owner"（這個會員已經綁了別的 Discord 帳號）｜
 *              "no_member"（訂單存在，但找不到對應的會員帳號）｜"order_not_found"
 */
export async function POST(req: Request) {
  try {
    requireBotSecret(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const orderNo = String(body.orderNo || "").trim();
  const discordUserId = String(body.discordUserId || "").trim();
  const discordUsername = String(body.discordUsername || "").trim();
  if (!orderNo || !discordUserId) return NextResponse.json({ error: "缺少 orderNo 或 discordUserId" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: order } = await supabase.from("orders").select("username").eq("order_no", orderNo).maybeSingle();
  if (!order) return NextResponse.json({ status: "order_not_found" });

  const { data: member } = await supabase.from("members").select("*").ilike("username", order.username).maybeSingle();
  if (!member) return NextResponse.json({ status: "no_member" });

  if (member.discord_user_id && member.discord_user_id !== discordUserId) {
    return NextResponse.json({ status: "wrong_owner" });
  }

  const { error } = await supabase
    .from("members")
    .update({ discord_username: discordUsername || member.discord_username, discord_user_id: discordUserId })
    .eq("id", member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  syncMembersSheet().catch(() => {});

  return NextResponse.json({ status: "ok", username: member.username });
}
