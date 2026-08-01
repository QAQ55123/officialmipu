import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/announcements
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcements: data });
}

// POST /api/admin/announcements
export async function POST(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const content = String(body.content || "").trim();
  if (!content) return NextResponse.json({ error: "請輸入公告內容" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("announcements").insert({ content }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcement: data });
}
