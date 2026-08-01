-- 標記舊資料匯入建立的「封存企劃」，讓歷史訂單裡的企劃連結知道要不要顯示成可點擊
-- 在 Supabase SQL Editor 執行一次即可

alter table plans add column if not exists is_legacy_archive boolean not null default false;

-- 把之前已經匯入過的封存企劃（用 hide_after_days = 0 當判斷依據）補標記
update plans set is_legacy_archive = true where hide_after_days = 0 and is_legacy_archive = false;
