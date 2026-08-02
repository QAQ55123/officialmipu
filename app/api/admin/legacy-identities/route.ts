import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 查詢身份名冊（僅限最高權限） ?q=搜尋字 */
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
  const q = (searchParams.get("q") || "").trim();

  const supabase = getSupabaseAdmin();
  let query = supabase.from("legacy_identities").select("*").order("created_at", { ascending: false }).limit(300);
  if (q) {
    query = query.or(
      `fb_nickname.ilike.%${q}%,line_nickname.ilike.%${q}%,discord_nickname.ilike.%${q}%,dc_account_name.ilike.%${q}%,fb_profile_url.ilike.%${q}%`
    );
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 已認領的補上新帳號名稱
  const claimedIds = (data || []).map((d) => d.claimed_by_member_id).filter(Boolean);
  let memberMap = new Map<string, string>();
  if (claimedIds.length) {
    const { data: members } = await supabase.from("members").select("id, username").in("id", claimedIds);
    memberMap = new Map((members || []).map((m) => [m.id, m.username]));
  }

  return NextResponse.json({
    identities: (data || []).map((d) => ({
      id: d.id,
      fbProfileUrl: d.fb_profile_url,
      fbNickname: d.fb_nickname,
      lineNickname: d.line_nickname,
      discordNickname: d.discord_nickname,
      dcAccountName: d.dc_account_name,
      claimed: !!d.claimed_by_member_id,
      claimedByUsername: d.claimed_by_member_id ? memberMap.get(d.claimed_by_member_id) || null : null,
      claimedAt: d.claimed_at,
    })),
  });
}
