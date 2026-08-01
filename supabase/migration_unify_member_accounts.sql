-- ⚠️ 重大結構調整：把會員系統從「LINE/Discord/FB 分開」改成「統一帳號」。
-- 這會改變 members 跟 orders 兩張表的欄位結構。
--
-- 強烈建議：執行這個檔案之前，先到 Table Editor 把 members 表的資料清空
-- （測試階段的帳號本來就要重新用新方式註冊，清空可以避免欄位轉換出錯）：
--
--   truncate table members cascade;
--
-- 訂單不會被清空、不會受影響（orders 已經改成企劃被刪除也會保留），
-- 但這次要把 orders 的識別欄位從「來源+暱稱+FB網址」改成「帳號」，
-- 所以舊訂單會出現在「帳號」欄位是空的狀態，之後沒辦法用帳號查到這些舊訂單。
-- 如果不介意舊訂單查不到（測試資料），直接往下執行即可。

-- 1. members 表：改成統一帳號結構
alter table members add column if not exists username text;
alter table members add column if not exists profile_url text;
alter table members add column if not exists profile_url_norm text;
alter table members add column if not exists email_verified boolean not null default false;
alter table members add column if not exists verify_token text;
alter table members add column if not exists verify_token_expires timestamptz;

-- 把舊的 fb_url / fb_url_norm 資料搬過去新欄位（如果沒清空 members，這步能保留個人頁網址）
update members set profile_url = fb_url where profile_url is null;
update members set profile_url_norm = fb_url_norm where profile_url_norm is null;

alter table members drop column if exists line_nick;
alter table members drop column if exists discord_nick;
alter table members drop column if exists fb_nick;
alter table members drop column if exists fb_url;
alter table members drop column if exists fb_url_norm;

alter table members alter column username set not null;
alter table members alter column profile_url set not null;
alter table members alter column profile_url_norm set not null;
alter table members alter column email set not null;

drop index if exists idx_members_line_nick;
drop index if exists idx_members_discord_nick;
create unique index if not exists idx_members_username on members (lower(username));
create unique index if not exists idx_members_email on members (lower(email));
create unique index if not exists idx_members_profile_url_norm on members (profile_url_norm);

-- 2. orders 表：改成用帳號識別，不再分來源
alter table orders add column if not exists username text;
alter table orders add column if not exists profile_url text;

update orders set username = nickname where username is null;
update orders set profile_url = fb_url where profile_url is null;

alter table orders drop column if exists source;
alter table orders drop column if exists nickname;
alter table orders drop column if exists fb_url;
alter table orders drop column if exists fb_url_norm;

alter table orders alter column username set not null;
alter table orders alter column profile_url set not null;

drop index if exists idx_orders_fb_norm;
create index if not exists idx_orders_username on orders (lower(username));

-- 3. 疑似重複會員工具已經沒有意義（統一帳號後不可能重複），這張表不再使用，可以直接刪除
drop table if exists suspected_duplicates;
