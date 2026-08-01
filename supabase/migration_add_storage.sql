-- 如果你已經先前執行過 schema.sql 或 migration_add_categories.sql，
-- 只要另外執行這個檔案來補上「商品圖片上傳」需要的儲存空間。

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
