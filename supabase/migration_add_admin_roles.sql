-- 如果你已經先前執行過 migration_add_admins.sql（admins 表已經建好），
-- 只要另外執行這個檔案來補上「owner / staff 權限等級」欄位。

alter table admins add column if not exists role text not null default 'staff';
alter table admins drop constraint if exists admins_role_check;
alter table admins add constraint admins_role_check check (role in ('owner', 'staff'));

-- 如果你自己是第一個註冊的帳號，想把自己升成 owner，執行下面這行（把 'your_username' 換成你的帳號）：
-- update admins set role = 'owner' where username = 'your_username';
