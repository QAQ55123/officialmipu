import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 查詢待處理的舊會員確認請求（僅限最高權限） ?status=pending（預設）｜resolved｜rejected｜all */
export async function GET(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  const supabase = getSupabaseAdmin();
  let query = supabase.from("legacy_claim_requests").select("*").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    requests: (data || []).map((r) => ({
      id: r.id,
      inputNickname: r.input_nickname,
      contactNote: r.contact_note,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    })),
  });
}

/** 處理請求（僅限最高權限）body: { id, action: "resolve" | "reject", adminNote } */
export async function PATCH(req: Request) {
  try {
    requireAdminSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  try {
    requireOwnerSession(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json();
  const id = String(body.id || "").trim();
  const action = String(body.action || "").trim();
  const adminNote = String(body.adminNote || "").trim();
  if (!id) return NextResponse.json({ error: "缺少請求 ID" }, { status: 400 });
  if (!["resolve", "reject"].includes(action)) return NextResponse.json({ error: "action 不正確" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("legacy_claim_requests")
    .update({
      status: action === "resolve" ? "resolved" : "rejected",
      admin_note: adminNote || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
