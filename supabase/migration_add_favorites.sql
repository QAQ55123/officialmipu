-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上「收藏企劃」功能。

create table if not exists favorites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  plan_id     uuid not null references plans(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (member_id, plan_id)
);
create index if not exists idx_favorites_member on favorites (member_id);
