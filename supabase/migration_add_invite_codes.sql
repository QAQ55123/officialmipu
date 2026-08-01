-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「staff 邀請碼改為一次性」功能。

create table if not exists admin_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  used        boolean not null default false,
  used_by     text,
  created_at  timestamptz default now(),
  used_at     timestamptz
);
