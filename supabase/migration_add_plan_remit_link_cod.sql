-- 讓個別企劃可以設定「在 ?pay=remit 這個限定連結底下，是否仍然開放取付」
-- 在 Supabase SQL Editor 執行一次即可

alter table plans add column if not exists allow_cod_on_remit_link boolean not null default false;
