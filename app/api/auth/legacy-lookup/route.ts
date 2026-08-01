import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 舊會員輸入暱稱，查身份名冊有沒有對應資料 ?nickname=xxx */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nickname = (searchParams.get("nickname") || "").trim();
  if (!nickname) return NextResponse.json({ error: "請輸入暱稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // 帳號剛好完全一樣、已經是會員了 → 請他直接登入
  const { data: existingMember } = await supabase.from("members").select("id").ilike("username", nickname).maybeSingle();
  if (existingMember) {
    return NextResponse.json({ alreadyRegistered: true });
  }

  const cols = ["fb_nickname", "line_nickname", "discord_nickname", "dc_account_name"];
  const results = await Promise.all(
    cols.map((col) =>
      supabase.from("legacy_identities").select("*").ilike(col, nickname).is("claimed_by_member_id", null)
    )
  );

  const seen = new Map<string, any>();
  for (const r of results) {
    for (const row of r.data || []) {
      seen.set(row.id, row);
    }
  }

  if (seen.size === 0) return NextResponse.json({ found: false });

  const candidates = Array.from(seen.values()).map((m: any) => ({
    id: m.id,
    profileUrl: m.fb_profile_url,
    nicknames: [m.fb_nickname, m.line_nickname, m.discord_nickname, m.dc_account_name].filter(Boolean),
  }));

  return NextResponse.json({ found: true, candidates });
}
