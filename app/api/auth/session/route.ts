import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ loggedIn: false });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").eq("id", session.memberId).maybeSingle();
  if (!member) return NextResponse.json({ loggedIn: false });

  return NextResponse.json({
    loggedIn: true,
    username: member.username,
    profileUrl: member.profile_url,
    pendingProfileUrl: member.pending_profile_url,
    email: member.email,
    emailVerified: member.email_verified,
  });
}
