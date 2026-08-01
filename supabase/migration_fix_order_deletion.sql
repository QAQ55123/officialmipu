-- 如果你已經先前執行過 schema.sql，只要另外執行這個檔案，
-- 修正「刪除企劃時訂單記錄也會一起被刪掉」這個問題。
-- 改成：刪除企劃後，訂單記錄會保留，並且會有一份下單當下的企劃名稱快照。

-- 1. 加上企劃名稱快照欄位
alter table orders add column if not exists plan_name_snapshot text;

-- 2. 幫現有的舊訂單，補上目前對應企劃的名稱快照（避免之後刪除企劃時名稱消失）
update orders o
set plan_name_snapshot = p.name
from plans p
where o.plan_id = p.id and o.plan_name_snapshot is null;

-- 3. 把 plan_id 改成可以是空值，並把外鍵刪除規則從「連動刪除」改成「設為空值」
alter table orders alter column plan_id drop not null;
alter table orders drop constraint if exists orders_plan_id_fkey;
alter table orders add constraint orders_plan_id_fkey
  foreign key (plan_id) references plans(id) on delete set null;
