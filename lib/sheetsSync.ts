import { getSupabaseAdmin } from "./supabase";
import { overwriteSheet, deleteSheetTabIfExists, requireSheetId } from "./googleSheets";
import { syncOrderRealtimeToPlanTab, syncAllPlanOrderTabs, syncCostWorkbook, syncOnePlanCostTab } from "./planSheetSync";

/** 訂單建立當下即時同步（呼叫端是客人下單流程，這裡「刻意」吞掉錯誤，
 *  Sheet 同步失敗不該讓客人沒辦法下單；真正的失敗原因會印在伺服器 log 裡，
 *  想確認同步有沒有成功，請用後台的「立即完整同步一次」，那裡的錯誤不會被吞掉 */
export async function syncOrderToSheet(params: { planId: string; planName: string }) {
  try {
    await syncOrderRealtimeToPlanTab(params.planId, params.planName);
  } catch (e) {
    console.error("Google Sheet 訂單同步失敗：", e);
    return; // 訂單分頁都沒同步成功，成本表也不用試了（成本表是讀訂單分頁內容統計的）
  }
  try {
    await syncOnePlanCostTab(params.planId, params.planName);
  } catch (e) {
    console.error("Google Sheet 成本表同步失敗：", e);
  }
}

/** 完整重新同步「所有企劃」的訂單分頁（給手動「立即完整同步一次」按鈕用）
 *  注意：這裡「不」吞掉錯誤，失敗要讓呼叫端知道 */
export async function syncAllOrdersSheet() {
  await syncAllPlanOrderTabs();
}

/** 刷新成本試算表（每企劃一分頁：商品成本表／運費計算／總覽／客戶應收運費），要在訂單分頁同步過之後執行 */
export async function syncAllOrdersCostSheet() {
  await syncCostWorkbook();
}

/** 會員資料會一直被編輯，改用「整份重寫」保持跟資料庫一致 */
export async function syncMembersSheet() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("members").select("*").order("created_at", { ascending: true });
  const rows = (data || []).map((m) => [
    m.username,
    m.profile_url,
    m.email,
    m.email_verified ? "已驗證" : "未驗證",
    new Date(m.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    m.discord_username || "",
    m.discord_user_id || "",
  ]);
  await overwriteSheet("會員", ["帳號", "個人頁網址", "Email", "信箱驗證", "註冊時間", "DC帳號名稱", "DC使用者ID"], rows);
}

/** 企劃資料同上，整份重寫 */
export async function syncPlansSheet() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("plans").select("*, categories(name)").order("sort_order", { ascending: true });
  const rows = (data || []).map((p) => [
    p.name,
    p.categories?.name || "（未分類）",
    p.deadline ? new Date(p.deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "常駐",
    Number(p.cod_limit) || 0,
    p.fulfillment_status || "",
    new Date(p.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  ]);
  await overwriteSheet("企劃", ["企劃名稱", "分類", "截止時間", "取付上限", "企劃狀態", "建立時間"], rows);
}

/** 「商品」這個分頁已經不需要了，因為每個企劃自己的分頁裡最上面就有一份商品目錄了，
 *  這裡改成單純確保這個舊分頁被刪掉（不存在的話什麼都不會發生，安全可以重複執行） */
export async function syncProductsSheet() {
  const id = requireSheetId();
  await deleteSheetTabIfExists(id, "商品");
}
