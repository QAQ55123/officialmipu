import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";
import { normFb } from "@/lib/util";
import { syncMembersSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 用帳號查詢會員資料 ?username=xxx */
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const username = (searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ error: "請輸入帳號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到這個會員" }, { status: 404 });

  return NextResponse.json({
    member: {
      username: member.username,
      profileUrl: member.profile_url,
      pendingProfileUrl: member.pending_profile_url,
      email: member.email,
      emailVerified: member.email_verified,
      createdAt: member.created_at,
    },
  });
}

/** 直接修正會員的個人頁網址（後台直接生效，不用走審核） body: { username, profileUrl } */
export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const username = String(body.username || "").trim();
  const profileUrlRaw = String(body.profileUrl || "").trim();
  if (!username || !profileUrlRaw) return NextResponse.json({ error: "請填寫帳號跟個人頁網址" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到這個會員" }, { status: 404 });

  const profileUrl = /^https?:\/\//i.test(profileUrlRaw) ? profileUrlRaw : "https://" + profileUrlRaw;
  const profileUrlNorm = normFb(profileUrl);

  const { data: existing } = await supabase.from("members").select("id").eq("profile_url_norm", profileUrlNorm).neq("id", member.id).maybeSingle();
  if (existing) return NextResponse.json({ error: "這個個人頁網址已經被其他帳號使用" }, { status: 409 });

  const { error } = await supabase
    .from("members")
    .update({ profile_url: profileUrl, profile_url_norm: profileUrlNorm, pending_profile_url: null, pending_profile_url_norm: null })
    .eq("id", member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  syncMembersSheet().catch(() => {});
  return NextResponse.json({ ok: true, profileUrl });
}

/** 刪除會員 body: { username } */
export async function DELETE(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const username = String(body.username || "").trim();
  if (!username) return NextResponse.json({ error: "請輸入帳號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("id").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到這個會員" }, { status: 404 });

  const { error } = await supabase.from("members").delete().eq("id", member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  syncMembersSheet().catch(() => {});
  return NextResponse.json({ ok: true });
}
