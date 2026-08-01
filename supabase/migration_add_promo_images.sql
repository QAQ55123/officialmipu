-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案來補上「企劃宣傳圖（可多張）」欄位。

alter table plans add column if not exists promo_images text[] default '{}';
