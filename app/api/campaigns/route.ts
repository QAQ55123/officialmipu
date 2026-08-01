import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/campaigns — 前台檔期列表（不需要登入）
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, opens_at, closes_at")
    .order("opens_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const campaigns = (data || []).map((c) => {
    const opensAt = new Date(c.opens_at).getTime();
    const closesAt = new Date(c.closes_at).getTime();
    const isOpen = now >= opensAt && now <= closesAt;
    return { ...c, isOpen };
  });

  return NextResponse.json({ campaigns });
}
