import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** 舊會員在整合頁面輸入暱稱找不到符合資料時，送出協助請求，等後台 owner 手動處理 */
export async function POST(req: Request) {
  const body = await req.json();
  const nickname = String(body.nickname || "").trim();
  const contactNote = String(body.contactNote || "").trim();
  if (!nickname) return NextResponse.json({ error: "請輸入暱稱" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("legacy_claim_requests").insert({
    input_nickname: nickname,
    contact_note: contactNote || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
