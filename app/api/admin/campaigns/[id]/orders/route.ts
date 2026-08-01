import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession } from "@/lib/adminAuth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, txn_method, members(username), order_items(id)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: (data || []).map((o: any) => ({
      id: o.id, createdAt: o.created_at, txnMethod: o.txn_method === "bank" ? "匯款" : "取付",
      customerName: o.members?.username ?? "", itemCount: o.order_items?.length ?? 0,
    })),
  });
}
