-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上
-- 「歷史訂單顯示商品圖片」功能。

alter table order_items add column if not exists image_url text;
