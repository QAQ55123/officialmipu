import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashMemberPw, verifyMemberPw } from "@/lib/util";
import { signMemberSession, memberSessionCookieHeader } from "@/lib/memberAuth";

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const newPassword = body.newPassword ? String(body.newPassword) : "";

  if (!username || !password) return NextResponse.json({ error: "請輸入帳號密碼" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  const ok = await verifyMemberPw(password, member.password_hash);
  if (!ok) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  if (newPassword) {
    const newHash = await hashMemberPw(newPassword);
    await supabase.from("members").update({ password_hash: newHash }).eq("id", member.id);
  }

  const token = signMemberSession(member.id, member.username);
  const res = NextResponse.json({
    ok: true,
    username: member.username,
    profileUrl: member.profile_url,
    pendingProfileUrl: member.pending_profile_url,
    email: member.email,
    emailVerified: member.email_verified,
  });
  res.headers.set("Set-Cookie", memberSessionCookieHeader(token));
  return res;
}
