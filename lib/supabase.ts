import { createClient } from "@supabase/supabase-js";

// 一般讀取用（前端 / route handler 皆可用，權限受 RLS 限制）
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// 後端寫入 / 後台工具用（略過 RLS，只能在 server 端使用，絕不可傳到前端）
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
