-- 防止「舊訂單匯入」重複執行時建立重複訂單：記錄這筆訂單是從哪個舊資料來源匯入的，
-- 匯入時如果發現同一個來源已經匯入過，就不會再建立第二筆。
-- 在 Supabase SQL Editor 執行一次即可

alter table orders add column if not exists legacy_source_ref text;
create unique index if not exists idx_orders_legacy_source_ref on orders (legacy_source_ref) where legacy_source_ref is not null;
