-- 讓會員可以綁定 Discord 帳號（給 Discord 喊單 Bot 用，寫進資料庫而不是寫 Sheet，
-- 這樣才不會被下次同步整份覆蓋掉）
-- 在 Supabase SQL Editor 執行一次即可

alter table members add column if not exists discord_username text;
alter table members add column if not exists discord_user_id text;
create index if not exists idx_members_discord_user_id on members (discord_user_id);
