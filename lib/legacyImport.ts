import { getSupabaseAdmin } from "@/lib/supabase";
import { google } from "googleapis";
import { toDirectImageUrl } from "@/lib/imageUrl";
import { normFb } from "@/lib/util";

export function norm(v: any): string {
  return String(v ?? "").trim();
}

/** 簡易 CSV 解析（全部當文字處理，避免大數字如 Discord ID 精度遺失） */
export function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* 忽略 */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.some((v) => norm(v) !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ""; });
      return obj;
    });
}

function genOrderNo(): string {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

/** 保留舊資料原本的訂單編號，不足 9 碼的前面補 0（例如 123456 → 000123456）；
 *  沒有原始編號、或不是純數字的話，才退回去隨機產生一個新的 */
function padOrderNo(raw: string): string {
  const s = norm(raw);
  if (!s) return genOrderNo();
  if (/^\d+$/.test(s)) return s.length < 9 ? s.padStart(9, "0") : s;
  return s; // 不是純數字（例如自己編的英數混合代號），原樣保留，不硬套補0規則
}

function parseFlexibleDate(raw: any): Date {
  const s = norm(raw);
  if (!s) return new Date();
  // 舊試算表裡的時間是台灣時間（UTC+8），但伺服器是用 UTC 在跑，
  // 如果不明確指定時區，"2026/07/20 16:20" 會被誤判成 UTC 時間，換算回台灣時間就會多 8 小時。
  let iso = s.replace(/\//g, "-").trim();
  if (!/[+-]\d\d:\d\d$/.test(iso) && !/Z$/i.test(iso)) {
    iso = iso.includes(" ") ? iso.replace(" ", "T") : iso;
    if (!iso.includes("T")) iso += "T00:00:00";
    iso += "+08:00";
  }
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ---------------- 身份名冊匯入 ----------------

export async function importLegacyIdentitiesFromCsv(csvText: string, commit: boolean) {
  const rows = parseCsv(csvText);
  const supabase = getSupabaseAdmin();
  const results: { row: number; label: string; status: "ok" | "skip" | "error"; message?: string }[] = [];
  let created = 0, updated = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;
    const fbProfileUrl = norm(r["FB個人網址"]);
    const fbNickname = norm(r["FB暱稱"]);
    const lineNickname = norm(r["LINE暱稱"]);
    const discordNickname = norm(r["Discord暱稱"]);
    const dcAccountName = norm(r["DC帳號名稱"]);
    const dcUserId = norm(r["DC使用者ID"]);
    const label = [fbNickname, lineNickname, discordNickname, dcAccountName].filter(Boolean).join(" / ") || "(無暱稱)";

    if (!fbProfileUrl) {
      results.push({ row: rowNo, label, status: "skip", message: "沒有 FB個人網址" });
      skipped++;
      continue;
    }
    if (!commit) {
      results.push({ row: rowNo, label: `${label} － ${fbProfileUrl}`, status: "ok" });
      continue;
    }

    const { data: existing } = await supabase.from("legacy_identities").select("id").eq("fb_profile_url_norm", normFb(fbProfileUrl)).maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("legacy_identities")
        .update({
          fb_profile_url: fbProfileUrl,
          fb_profile_url_norm: normFb(fbProfileUrl),
          fb_nickname: fbNickname || null,
          line_nickname: lineNickname || null,
          discord_nickname: discordNickname || null,
          dc_account_name: dcAccountName || null,
          dc_user_id: dcUserId || null,
        })
        .eq("id", existing.id);
      if (error) { results.push({ row: rowNo, label, status: "error", message: error.message }); skipped++; }
      else { results.push({ row: rowNo, label, status: "ok", message: "更新（已存在，沒有重複建立）" }); updated++; }
    } else {
      const { error } = await supabase.from("legacy_identities").insert({
        fb_profile_url: fbProfileUrl,
        fb_profile_url_norm: normFb(fbProfileUrl),
        fb_nickname: fbNickname || null,
        line_nickname: lineNickname || null,
        discord_nickname: discordNickname || null,
        dc_account_name: dcAccountName || null,
        dc_user_id: dcUserId || null,
      });
      if (error) { results.push({ row: rowNo, label, status: "error", message: error.message }); skipped++; }
      else { results.push({ row: rowNo, label, status: "ok", message: "新增" }); created++; }
    }
  }

  return { total: rows.length, created, updated, skipped, results };
}

// ---------------- 身份配對（共用） ----------------

async function buildIdentityIndex() {
  const supabase = getSupabaseAdmin();
  const { data: identities } = await supabase.from("legacy_identities").select("*");

  // 已經被認領的身份，補上目前會員的帳號/個人頁，讓「先認領後補訂單」也能正確配對
  const claimedIds = (identities || []).map((d) => d.claimed_by_member_id).filter(Boolean);
  let memberMap = new Map<string, any>();
  if (claimedIds.length) {
    const { data: members } = await supabase.from("members").select("id, username, profile_url").in("id", claimedIds);
    memberMap = new Map((members || []).map((m) => [m.id, m]));
  }

  const byFbUrl = new Map<string, any>();
  const byNickname = new Map<string, any[]>();
  for (const id of identities || []) {
    if (id.claimed_by_member_id) id.claimedMember = memberMap.get(id.claimed_by_member_id) || null;
    if (id.fb_profile_url) byFbUrl.set(id.fb_profile_url_norm || normFb(id.fb_profile_url), id);
    for (const nick of [id.fb_nickname, id.line_nickname, id.discord_nickname, id.dc_account_name]) {
      if (!nick) continue;
      const key = norm(nick).toLowerCase();
      if (!byNickname.has(key)) byNickname.set(key, []);
      byNickname.get(key)!.push(id);
    }
  }
  function resolve(fbUrl: string, nickname: string): { identity: any | null; ambiguous: boolean } {
    if (fbUrl) {
      const hit = byFbUrl.get(normFb(fbUrl));
      if (hit) return { identity: hit, ambiguous: false };
    }
    if (nickname) {
      const c = byNickname.get(norm(nickname).toLowerCase());
      if (c && c.length === 1) return { identity: c[0], ambiguous: false };
      if (c && c.length > 1) return { identity: null, ambiguous: true };
    }
    return { identity: null, ambiguous: false };
  }
  return { resolve };
}

async function findOrCreateArchivedPlan(planCache: Map<string, any>, planName: string, orderDate: Date, commit: boolean) {
  if (planCache.has(planName)) return planCache.get(planName);
  const supabase = getSupabaseAdmin();
  // 同名的話優先合併：不管是正常進行中的企劃、還是之前匯入建立的封存企劃，只要名字一樣就用同一筆，
  // 舊訂單會直接掛進那個企劃底下，不會另外建立重複的封存版本。找不到同名的才新建一個封存企劃。
  const { data: existing } = await supabase.from("plans").select("*").eq("name", planName).order("created_at", { ascending: true }).limit(1).maybeSingle();
  let plan = existing;
  if (!plan && commit) {
    const { data: created, error } = await supabase
      .from("plans")
      .insert({ name: planName, deadline: orderDate.toISOString(), hide_after_days: 0, fulfillment_status: "purchased", is_legacy_archive: true })
      .select()
      .single();
    if (error) throw new Error("建立封存企劃失敗：" + error.message);
    plan = created;
  }
  planCache.set(planName, plan);
  return plan;
}

// ---------------- 手動範本匯入 ----------------

export async function importLegacyOrdersManual(rows: Record<string, any>[], commit: boolean) {
  const supabase = getSupabaseAdmin();
  const { resolve } = await buildIdentityIndex();

  type Group = { groupKey: string; nickname: string; fbUrl: string; planName: string; payment: string; paidAmount: number; orderDate: Date; originalOrderNo: string; items: { name: string; style: string; qty: number; unitPrice: number }[] };
  const groups = new Map<string, Group>();
  const rowErrors: string[] = [];

  rows.forEach((r, idx) => {
    const rowNo = idx + 2;
    const groupKey = norm(r["訂單分組代號"]);
    const nickname = norm(r["暱稱"]);
    const fbUrl = norm(r["FB個人網址"]);
    const planName = norm(r["企劃名稱"]);
    const productName = norm(r["商品名稱"]);
    const style = norm(r["款式"]);
    const qty = Number(r["數量"]);
    const unitPrice = Number(r["單價"]) || 0;
    const payment = norm(r["交易方式"]);
    const paidAmount = Number(r["已收金額"] || 0);
    const orderDate = parseFlexibleDate(r["下單日期"]);
    const originalOrderNo = norm(r["原始訂單編號"]); // 選填，舊系統原本的訂單編號，有填的話會保留（不足9碼補0）

    if (!groupKey && !nickname && !planName && !productName) return;
    if (!groupKey || !nickname || !planName || !productName || !qty) {
      rowErrors.push(`第 ${rowNo} 列：缺少必填欄位，已略過`);
      return;
    }
    if (!["匯款", "取付"].includes(payment)) {
      rowErrors.push(`第 ${rowNo} 列：交易方式必須是「匯款」或「取付」，目前是「${payment || "(空白)"}」，已略過`);
      return;
    }
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, nickname, fbUrl, planName, payment, paidAmount, orderDate, originalOrderNo, items: [] });
    groups.get(groupKey)!.items.push({ name: productName, style, qty, unitPrice });
  });

  const planCache = new Map<string, any>();
  const results: { groupKey: string; label: string; matched: boolean; ambiguous: boolean; status: "ok" | "error"; message?: string }[] = [];
  let ok = 0, failed = 0, unmatched = 0;

  for (const g of groups.values()) {
    const { identity, ambiguous } = resolve(g.fbUrl, g.nickname);
    const total = g.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    if (!identity) unmatched++;

    if (!commit) {
      const sourceRef = `manual:${g.planName}:${g.groupKey}`;
      const { data: existingOrder } = await supabase.from("orders").select("order_no").eq("legacy_source_ref", sourceRef).maybeSingle();
      const dupLabel = existingOrder ? `（已經匯入過，訂單編號 ${existingOrder.order_no}，正式匯入時會自動跳過）` : "";
      results.push({ groupKey: g.groupKey, label: `${g.nickname} － ${g.planName} － ${g.items.length}項 小計NT$${total}${dupLabel}`, matched: !!identity, ambiguous, status: "ok" });
      continue;
    }

    try {
      const sourceRef = `manual:${g.planName}:${g.groupKey}`;
      const { data: existingOrder } = await supabase.from("orders").select("order_no").eq("legacy_source_ref", sourceRef).maybeSingle();
      if (existingOrder) {
        results.push({ groupKey: g.groupKey, label: `${g.nickname} － 已經匯入過了（訂單編號 ${existingOrder.order_no}），跳過`, matched: !!identity, ambiguous, status: "ok" });
        continue;
      }

      const plan = await findOrCreateArchivedPlan(planCache, g.planName, g.orderDate, true);
      for (const it of g.items) {
        const { data: existingProduct } = await supabase.from("products").select("id").eq("plan_id", plan.id).eq("name", it.name).eq("style", it.style).maybeSingle();
        if (!existingProduct) await supabase.from("products").insert({ plan_id: plan.id, name: it.name, style: it.style, price: it.unitPrice });
      }
      const claimedMember = identity?.claimedMember;
      const targetUsername = claimedMember?.username || g.nickname;
      const profileUrl = claimedMember?.profile_url || g.fbUrl || identity?.fb_profile_url || "（尚未確認）";
      const paddedOrderNo = g.originalOrderNo ? padOrderNo(g.originalOrderNo) : genOrderNo();
      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        order_no: paddedOrderNo, plan_id: plan.id, plan_name_snapshot: g.planName,
        username: targetUsername, profile_url: profileUrl, payment: g.payment, paid_amount: g.paidAmount,
        created_at: g.orderDate.toISOString(), legacy_identity_id: identity ? identity.id : null, legacy_unmatched: !identity,
        legacy_source_ref: sourceRef,
      }).select().single();
      if (orderErr) {
        throw new Error(
          orderErr.message.includes("duplicate")
            ? `訂單編號 ${paddedOrderNo} 跟現有訂單重複，需要手動處理`
            : orderErr.message
        );
      }
      const itemRows = g.items.map((it) => ({ order_id: order.id, product_name: it.name, style: it.style, qty: it.qty, unit_price: it.unitPrice, subtotal: it.qty * it.unitPrice }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
      if (itemsErr) throw new Error(itemsErr.message);
      results.push({ groupKey: g.groupKey, label: `${g.nickname} － ${g.planName}`, matched: !!identity, ambiguous, status: "ok" });
      ok++;
    } catch (e: any) {
      results.push({ groupKey: g.groupKey, label: `${g.nickname} － ${g.planName}`, matched: !!identity, ambiguous, status: "error", message: e.message });
      failed++;
    }
  }

  return { groupCount: groups.size, ok, failed, unmatched, rowErrors, results };
}

// ---------------- 自動解析舊試算表（標準格式，一次一個分頁） ----------------

function getLegacySheetsClient() {
  const email = norm(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  let key = norm(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  key = key.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  return google.sheets({ version: "v4", auth });
}

export async function listLegacySheetTabs(sheetId: string) {
  const sheets = getLegacySheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return (meta.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
}

export async function importLegacySheetTab(sheetId: string, tabName: string, commit: boolean) {
  const sheets = getLegacySheetsClient();
  const supabase = getSupabaseAdmin();
  const { resolve } = await buildIdentityIndex();

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tabName}!A1:L2000` });
  const rows = resp.data.values || [];

  const headerRowIdx = rows.findIndex((r) => norm(r[0]) === "訂單編號");
  if (headerRowIdx === -1) {
    return { standardFormat: false, message: "找不到「訂單編號」標題列，這個分頁不是標準格式，請用手動範本處理。" };
  }

  const catalogImageByKey = new Map<string, string>();
  for (let i = 0; i < headerRowIdx; i++) {
    const r = rows[i];
    const name = norm(r[0]);
    if (!name || name === "商品名稱") continue;
    const style = norm(r[1]);
    const image = norm(r[3]);
    if (image) catalogImageByKey.set(`${name}__${style}`, toDirectImageUrl(image));
  }

  const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r.some((v) => norm(v) !== ""));
  type Group = { orderNo: string; nickname: string; fbUrl: string; orderDate: Date; payment: string; items: { name: string; style: string; qty: number; unitPrice: number }[] };
  const groups = new Map<string, Group>();
  for (const r of dataRows) {
    const orderNo = norm(r[0]);
    if (!orderNo) continue;
    const nickname = norm(r[2]);
    const fbUrl = norm(r[3]);
    const productName = norm(r[4]);
    const style = norm(r[5]);
    const qty = Number(r[6]) || 0;
    const unitPrice = Number(r[7]) || 0;
    const payment = norm(r[10]) || "匯款";
    if (!groups.has(orderNo)) groups.set(orderNo, { orderNo, nickname, fbUrl, orderDate: parseFlexibleDate(r[9]), payment, items: [] });
    if (productName) groups.get(orderNo)!.items.push({ name: productName, style, qty, unitPrice });
  }

  const planCache = new Map<string, any>();
  const results: { orderNo: string; label: string; matched: boolean; ambiguous: boolean; status: "ok" | "error"; message?: string }[] = [];
  let ok = 0, failed = 0, unmatched = 0;
  let plan: any = commit && groups.size > 0 ? await findOrCreateArchivedPlan(planCache, tabName, new Date(), true) : null;

  for (const g of groups.values()) {
    const { identity, ambiguous } = resolve(g.fbUrl, g.nickname);
    const total = g.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    if (!identity) unmatched++;

    if (!commit) {
      const sourceRef = `sheet:${sheetId}:${tabName}:${g.orderNo}`;
      const { data: existingOrder } = await supabase.from("orders").select("order_no").eq("legacy_source_ref", sourceRef).maybeSingle();
      const dupLabel = existingOrder ? `（已經匯入過，訂單編號 ${existingOrder.order_no}，正式匯入時會自動跳過）` : "";
      results.push({ orderNo: g.orderNo, label: `${g.nickname || "(無暱稱)"} － ${g.items.length}項 小計NT$${total}${dupLabel}`, matched: !!identity, ambiguous, status: "ok" });
      continue;
    }

    try {
      // 防止重複匯入：這筆訂單（依試算表+分頁+原始訂單編號識別）如果已經匯入過，就跳過不重複建立
      const sourceRef = `sheet:${sheetId}:${tabName}:${g.orderNo}`;
      const { data: existingOrder } = await supabase.from("orders").select("order_no").eq("legacy_source_ref", sourceRef).maybeSingle();
      if (existingOrder) {
        results.push({ orderNo: g.orderNo, label: `${g.nickname || "(無暱稱)"} － 已經匯入過了（訂單編號 ${existingOrder.order_no}），跳過`, matched: !!identity, ambiguous, status: "ok" });
        continue;
      }

      for (const it of g.items) {
        const { data: existingProduct } = await supabase.from("products").select("id").eq("plan_id", plan.id).eq("name", it.name).eq("style", it.style).maybeSingle();
        if (!existingProduct) {
          const imageUrl = catalogImageByKey.get(`${it.name}__${it.style}`) || null;
          await supabase.from("products").insert({ plan_id: plan.id, name: it.name, style: it.style, price: it.unitPrice, image_url: imageUrl });
        }
      }
      const claimedMember = identity?.claimedMember;
      const profileUrl = claimedMember?.profile_url || g.fbUrl || identity?.fb_profile_url || "（尚未確認）";
      const usernamePlaceholder = claimedMember?.username || g.nickname || identity?.fb_nickname || identity?.line_nickname || identity?.discord_nickname || "（未知）";
      const paddedOrderNo = padOrderNo(g.orderNo);
      const { data: order, error: orderErr } = await supabase.from("orders").insert({
        order_no: paddedOrderNo, plan_id: plan.id, plan_name_snapshot: tabName,
        username: usernamePlaceholder, profile_url: profileUrl, payment: g.payment, paid_amount: 0,
        created_at: g.orderDate.toISOString(), legacy_identity_id: identity ? identity.id : null, legacy_unmatched: !identity,
        legacy_source_ref: sourceRef,
      }).select().single();
      if (orderErr) {
        throw new Error(
          orderErr.message.includes("duplicate")
            ? `訂單編號 ${paddedOrderNo} 跟現有訂單重複（可能是不同企劃的舊訂單剛好編號一樣），需要手動處理`
            : orderErr.message
        );
      }
      const itemRows = g.items.map((it) => ({
        order_id: order.id, product_name: it.name, style: it.style, qty: it.qty, unit_price: it.unitPrice,
        subtotal: it.qty * it.unitPrice, image_url: catalogImageByKey.get(`${it.name}__${it.style}`) || null,
      }));
      if (itemRows.length) {
        const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
        if (itemsErr) throw new Error(itemsErr.message);
      }
      results.push({ orderNo: g.orderNo, label: `${g.nickname || "(無暱稱)"} － ${g.items.length}項`, matched: !!identity, ambiguous, status: "ok" });
      ok++;
    } catch (e: any) {
      results.push({ orderNo: g.orderNo, label: g.nickname || "(無暱稱)", matched: !!identity, ambiguous, status: "error", message: e.message });
      failed++;
    }
  }

  return { standardFormat: true, orderCount: groups.size, ok, failed, unmatched, results };
}
