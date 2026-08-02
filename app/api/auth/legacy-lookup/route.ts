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

  const { data: legacyRows, error } = await supabase
    .from("legacy_identities")
    .select("*")
    .ilike("fb_nickname", nickname)
    .is("claimed_by_member_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!legacyRows || legacyRows.length === 0) return NextResponse.json({ found: false });

  const candidates = legacyRows.map((m: any) => ({
    id: m.id,
    profileUrl: m.fb_profile_url,
    nicknames: [m.fb_nickname].filter(Boolean),
  }));

  return NextResponse.json({ found: true, candidates });
}
