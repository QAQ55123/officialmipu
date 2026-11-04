import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMemberSession } from "@/lib/memberAuth";
import { normalizeDisplayName, displayNameFormatError } from "@/lib/displayName";
import { displayNameTakenError } from "@/lib/memberDisplayName";
import { syncMembersSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";

/**
 * 會員自己設定／修改會員名稱。不用輸入密碼，靠登入中的 session 判斷是誰。
 * 「編輯會員資料」和「登入後強制填寫」的視窗共用這支。
 * body: { displayName }
 */
export async function POST(req: Request) {
  const session = getMemberSession(req);
  if (!session) return NextResponse.json({ error: "登入已過期，請重新登入" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const displayName = normalizeDisplayName(body.displayName);
  const formatErr = displayNameFormatError(displayName);
  if (formatErr) return NextResponse.json({ error: formatErr }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("id, display_name").eq("id", session.memberId).maybeSingle();
  if (!member) return NextResponse.json({ error: "找不到你的會員資料，請重新登入" }, { status: 401 });

  const takenErr = await displayNameTakenError(supabase, displayName, member.id);
  if (takenErr) return NextResponse.json({ error: takenErr }, { status: 409 });

  const { error } = await supabase.from("members").update({ display_name: displayName }).eq("id", member.id);
  if (error) {
    // 兩個人同時搶同一個名稱時，資料庫的唯一索引會擋下來
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "這個會員名稱已經有人使用" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  syncMembersSheet().catch(() => {});
  return NextResponse.json({ ok: true, displayName });
}
