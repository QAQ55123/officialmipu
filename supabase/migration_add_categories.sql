-- 如果你已經先前執行過一次 schema.sql（表已經建好），
-- 只要另外執行這個檔案來補上「分類」功能，不用重建整個資料庫。

create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  parent_id     uuid references categories(id) on delete cascade,
  sort_order    int default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_categories_parent on categories (parent_id);

alter table plans add column if not exists category_id uuid references categories(id) on delete set null;
create index if not exists idx_plans_category on plans (category_id);
