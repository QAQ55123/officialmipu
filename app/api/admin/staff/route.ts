import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/staff — 列出所有管理者帳號（僅owner）
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
