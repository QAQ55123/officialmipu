import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function genCode(): string {
  // 例如 STAFF-9F3C7A2B，好讀好複製，同時足夠隨機
  return "STAFF-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

/** 列出所有 staff 邀請碼（含已使用/未使用狀態） */
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_invite_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    codes: (data || []).map((c) => ({
      id: c.id,
      code: c.code,
      used: c.used,
      usedBy: c.used_by,
      usedAt: c.used_at,
      createdAt: c.created_at,
    })),
  });
}

/** 產生一組新的一次性邀請碼 */
export async function POST(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // 重複機率極低，但還是保險重試一次
  for (let i = 0; i < 3; i++) {
    const code = genCode();
    const { data, error } = await supabase.from("admin_invite_codes").insert({ code }).select().single();
    if (!error) return NextResponse.json({ ok: true, code: data.code });
    if (!error.message.includes("duplicate")) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "產生邀請碼失敗，請再試一次" }, { status: 500 });
}

/** 撤銷一組還沒被使用的邀請碼 body: { id } */
export async function DELETE(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("admin_invite_codes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
