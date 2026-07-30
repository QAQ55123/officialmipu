import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashMemberPw } from "@/lib/util";
import { isExpired } from "@/lib/tokens";

export async function POST(req: Request) {
  const body = await req.json();
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!token) return NextResponse.json({ error: "缺少重設連結參數" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "密碼至少要 6 個字" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").eq("reset_token", token).maybeSingle();
  if (!member || isExpired(member.reset_token_expires)) {
    return NextResponse.json({ error: "連結無效或已過期，請重新申請忘記密碼" }, { status: 400 });
  }

  const passwordHash = await hashMemberPw(password);
  await supabase.from("members").update({ password_hash: passwordHash, reset_token: null, reset_token_expires: null }).eq("id", member.id);

  return NextResponse.json({ ok: true });
}
