-- 公告功能：可發佈多條公告，保留歷史紀錄
-- 在 Supabase SQL Editor 執行一次即可

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_announcements_created_at on announcements (created_at desc);
