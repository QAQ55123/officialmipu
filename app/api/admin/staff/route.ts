import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 列出所有管理者帳號 */
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admins")
    .select("id, username, email, email_verified, role, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    admins: (data || []).map((a) => ({
      id: a.id,
      username: a.username,
      email: a.email,
      emailVerified: a.email_verified,
      role: a.role,
      createdAt: a.created_at,
    })),
  });
}

/** 刪除一個管理者帳號（只能刪 staff，不能刪 owner，也不能刪自己） body: { id } */
export async function DELETE(req: Request) {
  let session;
  try {
    session = requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  if (id === session.adminId) return NextResponse.json({ error: "不能刪除自己的帳號" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: target } = await supabase.from("admins").select("id, role").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "找不到這個管理者" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "不能刪除最高權限的管理者帳號" }, { status: 403 });

  const { error } = await supabase.from("admins").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
