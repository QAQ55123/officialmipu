import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

// GET /api/admin/campaigns/:id/customers?q=xxx — 這個檔期已下單的顧客名單（搜尋過濾）
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase.from("orders").select("member_id").eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberIds = Array.from(new Set((orders || []).map((o) => o.member_id)));
  if (memberIds.length === 0) return NextResponse.json({ customers: [] });

  let query = supabase.from("members").select("id, username").in("id", memberIds);
  if (q) query = query.ilike("username", `%${q}%`);

  const { data: members, error: memberError } = await query.limit(20);
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ customers: members });
}
