import { getSupabaseAdmin } from "./supabase";
import { overwriteSheet, deleteSheetTabIfExists, requireSheetId } from "./googleSheets";
import { syncOrderRealtimeToPlanTab, syncAllCampaignOrderTabs } from "./planSheetSync";
import { syncCostSheetForCampaign, syncCostSummary, type CostTabRefs } from "./costSheetSync";

/** 訂單建立當下即時同步（呼叫端是客人下單流程，這裡「刻意」吞掉錯誤，
 *  Sheet 同步失敗不該讓客人沒辦法下單；真正的失敗原因會印在伺服器 log 裡，
 *  想確認同步有沒有成功，請用後台的「立即完整同步一次」，那裡的錯誤不會被吞掉 */
export async function syncOrderToSheet(params: { campaignId: string; campaignName: string }) {
  try {
    await syncOrderRealtimeToPlanTab(params.campaignId, params.campaignName);
  } catch (e) {
    console.error("Google Sheet 訂單同步失敗：", e);
    return; // 訂單分頁都沒同步成功，成本表也不用試了（成本表是讀訂單分頁內容統計的）
  }
  try {
    await syncCostSheetForCampaign(params.campaignId);
    // 總覽是跨檔期彙總，任何一個檔期的成本表變了都要重算一次
    await syncAllCostSummaryOnly();
  } catch (e) {
    console.error("Google Sheet 成本表同步失敗：", e);
  }
}

/** 完整重新同步「所有企劃」的訂單分頁（給手動「立即完整同步一次」按鈕用）
 *  注意：這裡「不」吞掉錯誤，失敗要讓呼叫端知道 */
export async function syncAllOrdersSheet() {
  await syncAllCampaignOrderTabs();
}

/** 只重算「總覽」分頁：重新掃一次所有檔期的成本表位置，不重寫各檔期的內容 */
async function syncAllCostSummaryOnly() {
  const supabase = getSupabaseAdmin();
  const { data: campaigns } = await supabase.from("campaigns").select("id, name");
  const refs: CostTabRefs[] = [];
  for (const c of campaigns || []) {
    try {
      refs.push(await syncCostSheetForCampaign(c.id));
    } catch {
      // 某個檔期失敗就跳過，總覽仍然更新其他檔期
    }
  }
  await syncCostSummary(refs);
}

/** 刷新成本試算表：每個檔期一個分頁（商品明細／收入／成本／總覽），
 *  資料直接從資料庫統計，不依賴訂單分頁的內容 */
export async function syncAllOrdersCostSheet() {
  const supabase = getSupabaseAdmin();
  const { data: campaigns } = await supabase.from("campaigns").select("id, name");
  const failed: string[] = [];
  const refs: CostTabRefs[] = [];
  for (const c of campaigns || []) {
    try {
      refs.push(await syncCostSheetForCampaign(c.id));
    } catch (e: any) {
      failed.push(`${c.name}：${e?.message || "同步失敗"}`);
    }
  }
  // 各檔期成本表寫完之後，再更新「總覽」分頁（它用跨分頁公式引用各檔期的數字）
  try {
    await syncCostSummary(refs);
  } catch (e: any) {
    failed.push(`總覽：${e?.message || "同步失敗"}`);
  }
  if (failed.length > 0) throw new Error(`部分檔期成本表同步失敗：${failed.join("；")}`);
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

/** 系列資料同上，整份重寫 */
export async function syncPlansSheet() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("series").select("*, categories(name)").order("sort_order", { ascending: true });
  const rows = (data || []).map((p) => [
    p.name,
    p.categories?.name || "（未分類）",
    p.is_visible !== false ? "顯示中" : "已隱藏",
    new Date(p.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  ]);
  await overwriteSheet("系列", ["系列名稱", "分類", "顯示狀態", "建立時間"], rows);
}

/** 「商品」這個分頁已經不需要了，因為每個企劃自己的分頁裡最上面就有一份商品目錄了，
 *  這裡改成單純確保這個舊分頁被刪掉（不存在的話什麼都不會發生，安全可以重複執行） */
export async function syncProductsSheet() {
  const id = requireSheetId();
  await deleteSheetTabIfExists(id, "商品");
}

/**
 * 依你的指示：legacy-claim／legacy-link 認領舊資料成功後，要同步「這個使用者在某個檔期內買了什麼」到
 * Google Sheet，依照檔期分頁（不是企劃），而且不需要像原本那樣同步成本／價目表分頁，
 * 只需要訂單內容分頁。orders/campaigns 表現在都已經存在，這裡正式實作。
 */
export async function syncMemberOrdersByCampaign(memberId: string) {
  const supabase = getSupabaseAdmin();
  const { data: member } = await supabase.from("members").select("username").eq("id", memberId).maybeSingle();
  if (!member) return;

  const { data: orders } = await supabase
    .from("orders")
    .select("campaign_id, campaigns(name)")
    .ilike("username", member.username)
    .not("campaign_id", "is", null);

  const campaignMap = new Map<string, string>();
  (orders || []).forEach((o: any) => {
    const name = o.campaigns?.name;
    if (o.campaign_id && name) campaignMap.set(o.campaign_id, name);
  });

  for (const [campaignId, campaignName] of campaignMap) {
    try {
      // 只同步訂單內容分頁，不需要成本／價目表（那份是給店家內部用的，跟這個顧客認領舊資料無關）
      await syncOrderRealtimeToPlanTab(campaignId, campaignName);
    } catch (e) {
      console.error(`同步會員檔期訂單失敗（檔期：${campaignName}）：`, e);
    }
  }
}
