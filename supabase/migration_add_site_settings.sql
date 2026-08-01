-- 網站設定（key-value），第一個用途是結帳頁的說明欄，之後可以擴充別的設定
-- 在 Supabase SQL Editor 執行一次即可

create table if not exists site_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);
