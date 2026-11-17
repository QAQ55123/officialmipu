import { createClient } from "@supabase/supabase-js";

/**
 * 查資料庫一律不快取。
 * Next.js 會把伺服器端 fetch（Supabase 底層也是用 fetch）的結果存進快取重複使用，連重新部署都不會清掉，
 * 結果後台一直看到舊資料（例如出貨作業頁顯示「可出貨」，其實已經出過貨）。
 * 在這裡統一加上 cache: "no-store"，全站所有查詢都拿最新資料，不用每支程式各自設定。
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

// 一般讀取用（前端 / route handler 皆可用，權限受 RLS 限制）
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: noStoreFetch } }
  );
}

// 後端寫入 / 後台工具用（略過 RLS，只能在 server 端使用，絕不可傳到前端）
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: noStoreFetch } }
  );
}
