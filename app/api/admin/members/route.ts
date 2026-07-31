import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

// GET /api/admin/members?q=xxx — 會員列表（搜尋帳號/Email）
// 僅 owner 可用：會員相關工具是最高權限管理者才能碰的範圍，一般管理者(staff)看不到
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("members")
    .select("id, username, email, email_verified, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) query = query.or(`username.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}
