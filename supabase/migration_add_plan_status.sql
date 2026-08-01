-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「截止後自動隱藏」跟「企劃狀態（已購買/運輸中/已到貨/已開賣場）」功能。

alter table plans add column if not exists hide_after_days int;
alter table plans add column if not exists fulfillment_status text;
