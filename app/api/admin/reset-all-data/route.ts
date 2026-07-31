import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdminSession, requireOwnerSession, clearSessionCookieHeader } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const CONFIRM_PHRASE = "清空所有資料";

/**
 * POST /api/admin/reset-all-data
 * body: { confirm: "清空所有資料" }（一定要完全符合這個字串才會執行）
 *
 * 把整個系統的業務資料清空回一片白紙（依外鍵順序刪除），
 * 清完之後所有管理者帳號也會被刪除，需要用「最高管理者邀請碼」（環境變數 ADMIN_INVITE_CODE_OWNER）
 * 重新註冊 owner 帳號。危險操作，僅owner可執行。
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

  // 依外鍵順序刪除，避免刪不掉
  const tableOrder = [
    "shipping_batch_items",
    "shipping_batches",
    "vendor_shipment_items",
    "vendor_shipments",
    "vendor_order_numbers",
    "vendor_purchase_order_gifts",
    "vendor_purchase_order_items",
    "vendor_purchase_orders",
    "vendor_purchase_batches",
    "vendor_platform_tier_caps",
    "vendor_platforms",
    "vendor_gift_tiers",
    "vendor_extra_purchases",
    "backorders",
    "order_gift_selections",
    "order_items",
    "orders",
    "gift_styles",
    "product_variants",
    "products",
    "series",
    "campaigns",
    "cost_sheets",
    "announcements",
    "site_settings",
    "admin_invite_codes",
    "members",
    "admins",
  ];

  const deleted: Record<string, number> = {};
  const warnings: string[] = [];
  for (const table of tableOrder) {
    if (table === "site_settings" || table === "cost_sheets") {
      // 這兩張表的主鍵不是 id，用 not(...,is,null) 搭配主鍵欄位刪除全部
      const pk = table === "site_settings" ? "key" : "campaign_id";
      const { error, count } = await supabase.from(table).delete({ count: "exact" }).not(pk, "is", null);
      deleted[table] = count || 0;
      if (error) warnings.push(`清除資料表「${table}」失敗：${error.message}`);
      continue;
    }
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).not("id", "is", null);
    if (error) {
      warnings.push(`清除資料表「${table}」失敗：${error.message}`);
    } else {
      deleted[table] = count || 0;
    }
  }

  const res = NextResponse.json({ ok: true, deleted, warnings });
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}
