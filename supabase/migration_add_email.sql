-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上 Email 相關功能
-- （信箱驗證、忘記密碼），不用重建整個資料庫。

alter table admins add column if not exists email text;
alter table admins add column if not exists email_verified boolean not null default false;
alter table admins add column if not exists verify_token text;
alter table admins add column if not exists verify_token_expires timestamptz;
alter table admins add column if not exists reset_token text;
alter table admins add column if not exists reset_token_expires timestamptz;
create unique index if not exists idx_admins_email on admins (lower(email)) where email is not null;

alter table members add column if not exists email text;
alter table members add column if not exists reset_token text;
alter table members add column if not exists reset_token_expires timestamptz;
create unique index if not exists idx_members_email on members (lower(email)) where email is not null;
