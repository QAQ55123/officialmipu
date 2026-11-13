import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";

/** 申請取消訂單（需要最高管理者審核，且要在企劃截止前才能申請）body: { username } */
export async function PATCH(req: Request, { params }: { params: { orderNo: string } }) {
  // 帳號一律取自登入狀態，不採用顧客送來的 username
  const username = getMemberSession(req)?.username;
  const supabase = getSupabaseAdmin();

  const { data: order, error } = await supabase.from("orders").select("*, campaigns(opens_at, closes_at)").eq("order_no", params.orderNo).single();
  if (error || !order) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });

  if (!username || String(username).toLowerCase() !== String(order.username).toLowerCase()) {
    return NextResponse.json({ error: "身分驗證失敗，無法申請取消此訂單" }, { status: 403 });
  }
  const campaignNow2 = order.campaigns;
  if (campaignNow2 && (new Date(campaignNow2.opens_at).getTime() > Date.now() || new Date(campaignNow2.closes_at).getTime() < Date.now())) {
    return NextResponse.json({ error: "此檔期目前非開放時間，無法申請取消訂單" }, { status: 400 });
  }
  if (order.cancel_requested_at) {
    return NextResponse.json({ error: "已經申請過取消了，請等待審核" }, { status: 400 });
  }

  await supabase.from("orders").update({ cancel_requested_at: new Date().toISOString() }).eq("id", order.id);
  return NextResponse.json({ ok: true });
}
