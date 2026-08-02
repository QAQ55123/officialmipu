-- 會員系統 schema（依你的指示：members 表原封不動搬過來；
-- legacy_identities 依你確認過的簡化，只留 FB暱稱＋FB個人頁網址，拿掉 LINE/Discord 相關欄位）

create extension if not exists "pgcrypto";

-- ============================================================
-- 會員（完全比照 mibu-app 原本結構，不做任何修改）
-- ============================================================

create table if not exists members (
  id                    uuid primary key default gen_random_uuid(),
  username              text not null,
  password_hash         text not null,               -- bcrypt
  profile_url           text not null,               -- 個人頁網址（例如 FB 個人首頁）
  profile_url_norm      text not null,                -- 正規化後的網址，避免同一人重複註冊
  email                 text not null,
  email_verified        boolean not null default false,
  verify_token          text,
  verify_token_expires  timestamptz,
  reset_token           text,
  reset_token_expires   timestamptz,
  pending_profile_url      text,          -- 使用者申請修改個人頁網址，要等最高管理者審核通過才會生效
  pending_profile_url_norm text,
  discord_username      text,          -- Discord 帳號名稱（喊單 Bot 綁定用）
  discord_user_id       text,          -- Discord 使用者ID（喊單 Bot 綁定用）
  created_at            timestamptz default now()
);
create unique index if not exists idx_members_username on members (lower(username));
create unique index if not exists idx_members_email on members (lower(email));
create unique index if not exists idx_members_profile_url_norm on members (profile_url_norm);

-- ============================================================
-- 舊會員身份名冊（依你確認：只留 FB暱稱＋FB個人頁網址這一組，
-- 拿掉原本 line_nickname／discord_nickname／dc_account_name／dc_user_id）
-- ============================================================

create table if not exists legacy_identities (
  id                    uuid primary key default gen_random_uuid(),
  fb_profile_url        text not null,
  fb_profile_url_norm   text,                     -- 正規化過的網址，用來判斷是不是同一個人，防止重複匯入
  fb_nickname           text,
  claimed_by_member_id  uuid references members(id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_legacy_identities_fb_nick on legacy_identities (lower(fb_nickname));

-- 舊會員在整合頁面輸入暱稱找不到符合資料時，送出協助請求，等後台 owner 手動處理（原封不動）
create table if not exists legacy_claim_requests (
  id                    uuid primary key default gen_random_uuid(),
  input_nickname        text not null,
  contact_note          text,
  status                text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolved_identity_id  uuid references legacy_identities(id) on delete set null,
  admin_note            text,
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz
);
create index if not exists idx_legacy_claim_requests_status on legacy_claim_requests (status);

-- 明確關閉 RLS（這個專案的權限判斷全部寫在後端 API 程式碼裡，不使用 Supabase RLS 機制）
alter table members disable row level security;
alter table legacy_identities disable row level security;
alter table legacy_claim_requests disable row level security;
