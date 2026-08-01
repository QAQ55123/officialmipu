import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession, clearSessionCookieHeader } from "@/lib/adminAuth";
import { requireSheetId, requireCostSheetId, deleteSheetTabIfExists } from "@/lib/googleSheets";
import { deletePlanDeadlineEvent } from "@/lib/googleCalendar";
import { syncPlansSheet, syncMembersSheet } from "@/lib/sheetsSync";

export const dynamic = "force-dynamic";

const CONFIRM_PHRASE = "清空所有資料";

/**
 * 把整個系統的資料清空回一片白紙：先清 Google 行事曆事件、Google Sheet 分頁（best-effort，
 * 個別失敗不會擋住整體流程），再清資料庫所有表。清完之後所有管理者帳號也會被刪除，
 * 需要用「最高管理者邀請碼」（環境變數 OWNER_INVITE_CODE）重新註冊 owner 帳號。
 * body: { confirm: "清空所有資料" }（一定要完全符合這個字串才會執行）
 */
export async function POST(req: Request) {
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
  if (String(body.confirm || "") !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `請輸入正確的確認文字「${CONFIRM_PHRASE}」` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];

  // ---------- 1. 清 Google 行事曆事件 ----------
  const { data: plans } = await supabase.from("plans").select("id, name, calendar_event_id");
  for (const p of plans || []) {
    if (p.calendar_event_id) {
      try {
        await deletePlanDeadlineEvent(p.calendar_event_id);
      } catch (e: any) {
        warnings.push(`行事曆事件「${p.name}」刪除失敗：${e?.message || "未知錯誤"}`);
      }
    }
  }

  // ---------- 2. 清 Google Sheet 分頁（主試算表 + 成本試算表，含隱藏明細分頁）----------
  let mainSheetId = "";
  let costSheetId = "";
  try {
    mainSheetId = requireSheetId();
  } catch {}
  try {
    costSheetId = requireCostSheetId();
  } catch {}

  for (const p of plans || []) {
    if (mainSheetId) {
      try {
        await deleteSheetTabIfExists(mainSheetId, p.name);
      } catch (e: any) {
        warnings.push(`主試算表分頁「${p.name}」刪除失敗：${e?.message || "未知錯誤"}`);
      }
    }
    if (costSheetId) {
      try {
        await deleteSheetTabIfExists(costSheetId, p.name);
        await deleteSheetTabIfExists(costSheetId, `_${p.name}_明細`);
      } catch (e: any) {
        warnings.push(`成本試算表分頁「${p.name}」刪除失敗：${e?.message || "未知錯誤"}`);
      }
    }
  }

  // ---------- 3. 清資料庫（照外鍵順序，避免刪不掉）----------
  const tableOrder = [
    "order_items",
    "orders",
    "favorites",
    "products",
    "plans",
    "categories",
    "legacy_claim_requests",
    "legacy_identities",
    "announcements",
    "site_settings",
    "admin_invite_codes",
    "members",
    "admins",
  ];
  const deleted: Record<string, number> = {};
  for (const table of tableOrder) {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).not("id", "is", null);
    if (error) {
      // site_settings 的主鍵欄位叫 key 不是 id，特殊處理
      if (table === "site_settings") {
        const r2 = await supabase.from(table).delete({ count: "exact" }).not("key", "is", null);
        deleted[table] = r2.count || 0;
        if (r2.error) warnings.push(`清除資料表「${table}」失敗：${r2.error.message}`);
      } else {
        warnings.push(`清除資料表「${table}」失敗：${error.message}`);
      }
    } else {
      deleted[table] = count || 0;
    }
  }

  // ---------- 4. 把「企劃」「會員」總覽分頁重寫成空的 ----------
  try {
    await syncPlansSheet();
  } catch (e: any) {
    warnings.push("重寫企劃總覽分頁失敗：" + (e?.message || "未知錯誤"));
  }
  try {
    await syncMembersSheet();
  } catch (e: any) {
    warnings.push("重寫會員總覽分頁失敗：" + (e?.message || "未知錯誤"));
  }

  const res = NextResponse.json({ ok: true, deleted, warnings });
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}
