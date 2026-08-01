import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashMemberPw } from "@/lib/util";
import { requireOwnerSession } from "@/lib/adminAuth";

/** body: { username } → 密碼重設為 0000 */
export async function POST(req: Request) {
  const body = await req.json();
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const username = String(body.username || "").trim();
  if (!username) return NextResponse.json({ error: "請提供帳號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("*").ilike("username", username).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到會員" }, { status: 404 });

  const newHash = await hashMemberPw("0000");
  await supabase.from("members").update({ password_hash: newHash }).eq("id", member.id);

  return NextResponse.json({ ok: true });
}
