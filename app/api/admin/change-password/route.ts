import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, verifyAdminPw, hashAdminPw } from "@/lib/adminAuth";

export async function POST(req: Request) {
  let session;
  try {
    session = requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const password = String(body.password || "");
  const newPassword = String(body.newPassword || "");
  if (!password) return NextResponse.json({ error: "請輸入目前的密碼" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: "新密碼至少要 8 個字" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: admin } = await supabase.from("admins").select("*").eq("id", session.adminId).single();
  if (!admin) return NextResponse.json({ error: "找不到帳號" }, { status: 404 });

  const ok = await verifyAdminPw(password, admin.password_hash);
  if (!ok) return NextResponse.json({ error: "密碼錯誤" }, { status: 403 });

  const newHash = await hashAdminPw(newPassword);
  const { error } = await supabase.from("admins").update({ password_hash: newHash }).eq("id", admin.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
