-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上「獨立管理者帳號」功能。

create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz default now()
);
