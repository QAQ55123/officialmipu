-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「個人頁網址修改需要最高管理者審核」功能。

alter table members add column if not exists pending_profile_url text;
alter table members add column if not exists pending_profile_url_norm text;
