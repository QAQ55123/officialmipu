-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「使用者申請取消訂單，需要最高管理者審核」功能。

alter table orders add column if not exists cancel_requested_at timestamptz;
