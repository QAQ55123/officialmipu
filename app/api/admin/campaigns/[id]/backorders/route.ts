import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 3.3節：獨立的「欠貨總覽」頁面，列出目前所有還沒補齊的欠貨清單，不需要等到貨當下才能查看 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("backorders")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("fulfilled", false)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    backorders: (data || []).map((b) => ({
      id: b.id,
      username: b.username,
      productName: b.product_name,
      style: b.style,
      qty: b.qty,
      createdAt: b.created_at,
    })),
  });
}
