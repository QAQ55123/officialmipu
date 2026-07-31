import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/campaigns/:id/notify-recipients — 查詢這個檔期的到貨通知信收件人數量
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase.from("campaigns").select("id, name").eq("id", params.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "找不到這個檔期" }, { status: 404 });

  const { data: orders } = await supabase.from("orders").select("member_id").eq("campaign_id", params.id);
  const memberIds = Array.from(new Set((orders || []).map((o) => o.member_id).filter(Boolean)));

  if (memberIds.length === 0) return NextResponse.json({ campaignName: campaign.name, emailCount: 0, memberCount: 0 });

  const { data: members } = await supabase.from("members").select("email").in("id", memberIds).not("email", "is", null);
  const emailSet = new Set((members || []).map((m) => m.email!.toLowerCase()));

  return NextResponse.json({ campaignName: campaign.name, memberCount: memberIds.length, emailCount: emailSet.size });
}
