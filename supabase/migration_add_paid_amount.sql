-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「後台填寫已收金額，同步顯示在 Sheet 跟會員前台」功能。

alter table orders add column if not exists paid_amount numeric default 0;
