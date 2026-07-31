import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_KEYS = ["checkout_notice"];

// GET /api/admin/site-settings — 讀取所有設定（僅owner）
export async function GET(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("site_settings").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value || "";

  return NextResponse.json({ checkoutNotice: map["checkout_notice"] || "" });
}

// PATCH /api/admin/site-settings — 更新設定（僅owner）body: { key, value }
export async function PATCH(req: Request) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const body = await req.json();
  const key = String(body.key || "").trim();
  const value = String(body.value ?? "");
  if (!ALLOWED_KEYS.includes(key)) return NextResponse.json({ error: "不支援的設定項目" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
