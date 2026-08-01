-- 舊會員身份整合：身份名冊（跨平台暱稱對照）+ 待處理請求 + 訂單身份連結欄位
-- 在 Supabase SQL Editor 執行一次即可

-- 身份名冊：匯入舊系統的「FB個人網址／FB暱稱／LINE暱稱／Discord暱稱／DC帳號名稱／DC使用者ID」對照表
create table if not exists legacy_identities (
  id                    uuid primary key default gen_random_uuid(),
  fb_profile_url        text not null,
  fb_nickname           text,
  line_nickname         text,
  discord_nickname      text,
  dc_account_name       text,
  dc_user_id            text,
  claimed_by_member_id  uuid references members(id) on delete set null,  -- 被哪個新帳號認領了（null＝還沒被認領）
  claimed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_legacy_identities_fb_nick on legacy_identities (lower(fb_nickname));
create index if not exists idx_legacy_identities_line_nick on legacy_identities (lower(line_nickname));
create index if not exists idx_legacy_identities_discord_nick on legacy_identities (lower(discord_nickname));
create index if not exists idx_legacy_identities_dc_account on legacy_identities (lower(dc_account_name));
create index if not exists idx_legacy_identities_claimed_by on legacy_identities (claimed_by_member_id);

-- 待處理請求：使用者在「舊會員整合」頁面輸入暱稱找不到符合資料時，按「請管理者協助確認」送出的請求
create table if not exists legacy_claim_requests (
  id                    uuid primary key default gen_random_uuid(),
  input_nickname        text not null,
  contact_note          text,             -- 使用者自己補充的說明／聯絡方式
  status                text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolved_identity_id  uuid references legacy_identities(id) on delete set null,
  admin_note            text,
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz
);
create index if not exists idx_legacy_claim_requests_status on legacy_claim_requests (status);

-- orders 增加跟身份名冊的連結：解析舊訂單資料時，能對到身份名冊的會記錄在這裡；
-- 對不到的（legacy_unmatched = true）需要後台手動指定正確的擁有者
alter table orders add column if not exists legacy_identity_id uuid references legacy_identities(id) on delete set null;
alter table orders add column if not exists legacy_unmatched boolean not null default false;
create index if not exists idx_orders_legacy_identity on orders (legacy_identity_id);
