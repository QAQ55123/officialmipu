-- 企劃截止時間自動同步到 Google 行事曆，需要一個欄位記錄對應的行事曆事件 ID
-- 在 Supabase SQL Editor 執行一次即可

alter table plans add column if not exists calendar_event_id text;
