import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminPw, signSession, sessionCookieHeader } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const body = await req.json();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return NextResponse.json({ error: "請輸入帳號密碼" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: admin } = await supabase.from("admins").select("*").ilike("username", username).maybeSingle();
  if (!admin) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  const ok = await verifyAdminPw(password, admin.password_hash);
  if (!ok) return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });

  const token = signSession(admin.id, admin.username, admin.role);
  const res = NextResponse.json({ ok: true, username: admin.username, role: admin.role });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
