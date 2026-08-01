import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 列出所有待審核的個人頁網址修改申請 */
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("members")
    .select("id, username, profile_url, pending_profile_url, created_at")
    .not("pending_profile_url", "is", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data || []).map((m) => ({
      memberId: m.id,
      username: m.username,
      currentProfileUrl: m.profile_url,
      pendingProfileUrl: m.pending_profile_url,
    })),
  });
}

/** 核准：把待審核網址正式生效 body: { memberId } */
export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const memberId = String(body.memberId || "");
  if (!memberId) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").eq("id", memberId).single();
  if (!member || !member.pending_profile_url) return NextResponse.json({ error: "找不到待審核的申請" }, { status: 404 });

  const { error } = await supabase
    .from("members")
    .update({
      profile_url: member.pending_profile_url,
      profile_url_norm: member.pending_profile_url_norm,
      pending_profile_url: null,
      pending_profile_url_norm: null,
    })
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** 拒絕：清掉待審核申請，不套用 body: { memberId } */
export async function DELETE(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const memberId = String(body.memberId || "");
  if (!memberId) return NextResponse.json({ error: "缺少會員 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("members")
    .update({ pending_profile_url: null, pending_profile_url_norm: null })
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
