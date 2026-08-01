-- 米舖訂購系統 — Supabase (PostgreSQL) schema
-- 在 Supabase 專案的 SQL Editor 貼上並執行一次即可建好所有資料表。

create extension if not exists "pgcrypto";

-- 一次性邀請碼（給 staff 等級用；owner 還是用固定的環境變數邀請碼，不受影響）
create table if not exists admin_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  used        boolean not null default false,
  used_by     text,
  created_at  timestamptz default now(),
  used_at     timestamptz
);

-- 管理者（後台帳號，跟 members 完全分開，互不影響）
-- role: 'owner'（最高權限，能碰會員相關工具）／'staff'（一般管理者，不能碰會員資料）
create table if not exists admins (
  id                    uuid primary key default gen_random_uuid(),
  username              text not null unique,
  email                 text unique,
  email_verified         boolean not null default false,
  password_hash         text not null,
  role                  text not null default 'staff' check (role in ('owner', 'staff')),
  verify_token          text,
  verify_token_expires  timestamptz,
  reset_token           text,
  reset_token_expires   timestamptz,
  created_at            timestamptz default now()
);

-- 收藏清單（會員收藏的企劃）
create table if not exists favorites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  plan_id     uuid not null references plans(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (member_id, plan_id)
);
create index if not exists idx_favorites_member on favorites (member_id);

-- 分類（兩層：分類 > 子分類。子分類的 parent_id 指向上層分類；頂層分類 parent_id 為 null）
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  parent_id     uuid references categories(id) on delete cascade,
  sort_order    int default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_categories_parent on categories (parent_id);

-- 企劃（原本「企劃清單」分頁）
create table if not exists plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,               -- 企劃名稱
  deadline      timestamptz,                 -- 截止時間（null = 不限期）
  image_url     text,                        -- 企劃圖片
  cod_limit     numeric default 0,           -- 取付上限（0 或負數 = 不開放取付）
  visible_to    text[] default '{}',         -- 顯示對象，例如 {LINE,DC}；空陣列 = 全部看得到
  category_id   uuid references categories(id) on delete set null,  -- 歸屬的分類或子分類（可為任一層）
  promo_images  text[] default '{}',         -- 宣傳圖（可多張），顯示在商品頁最上方
  hide_after_days   int,                     -- 截止後幾天要從瀏覽清單隱藏（留空＝永遠不自動隱藏）
  fulfillment_status text,                   -- 企劃目前狀態：purchased 已購買／shipping 運輸中／arrived 已到貨／distributing 已開賣場（留空＝尚未開始）
  is_legacy_archive boolean not null default false, -- true＝舊資料匯入建立的封存企劃（商品目錄不完整，前台不可點擊進入）
  calendar_event_id text,                     -- 對應的 Google 行事曆事件 ID（截止時間自動同步用）
  allow_cod_on_remit_link boolean not null default false, -- 在 ?pay=remit 限定連結下，這個企劃是否仍開放取付
  sort_order    int default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_plans_category on plans (category_id);

-- 商品（原本每個企劃分頁裡的價目表）
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references plans(id) on delete cascade,
  name          text not null,
  style         text default '',
  price         numeric not null default 0,
  image_url     text,
  sort_order    int default 0
);

-- 會員（統一帳號系統，不分 LINE/Discord/FB，一組帳號密碼登入）
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
create index if not exists idx_members_discord_user_id on members (discord_user_id);

-- 訂單（一張訂單一筆，品項另外存 order_items）
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           text not null unique,
  plan_id            uuid references plans(id) on delete set null,  -- 企劃被刪除後，訂單仍然保留（只是不再連到那筆企劃）
  plan_name_snapshot text,                        -- 下單當下的企劃名稱快照，不會因企劃被刪而遺失
  username           text not null,               -- 下單當時的帳號
  profile_url        text not null,               -- 下單當時的個人頁網址快照
  payment            text not null,               -- 匯款 / 取付
  paid_status        text default '',             -- 空 / 已付款 等
  paid_amount        numeric default 0,           -- 已收金額（管理者在後台填寫，會同步顯示在會員的訂單頁面，也會同步到 Google Sheet 的付款狀態欄）
  cancel_requested_at timestamptz,                 -- 使用者申請取消訂單的時間，要等最高管理者審核（核准＝刪除、拒絕＝清空這個欄位）
  legacy_identity_id uuid,                         -- 舊資料匯入：對應到 legacy_identities 的身份（沒有特別建外鍵，靠程式端維護）
  legacy_unmatched   boolean not null default false, -- 舊資料匯入時對不到身份名冊，需要後台手動指定擁有者
  legacy_source_ref  text,                           -- 舊資料匯入的來源識別碼，防止重複匯入同一筆訂單
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_orders_plan on orders (plan_id);
create index if not exists idx_orders_username on orders (lower(username));

create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_name  text not null,
  style         text default '',
  qty           int not null,
  unit_price    numeric not null,
  subtotal      numeric not null,
  image_url     text
);
create index if not exists idx_order_items_order on order_items (order_id);

-- updated_at 自動更新
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at before update on orders
  for each row execute function set_updated_at();

-- 商品圖片儲存空間（公開讀取，只有後台用 service role 金鑰才能上傳）
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- ============================================================
-- 舊會員身份整合：身份名冊（跨平台暱稱對照）+ 待處理請求
-- ============================================================

create table if not exists legacy_identities (
  id                    uuid primary key default gen_random_uuid(),
  fb_profile_url        text not null,
  fb_profile_url_norm   text,                     -- 正規化過的網址，用來判斷是不是同一個人，防止重複匯入
  fb_nickname           text,
  line_nickname         text,
  discord_nickname      text,
  dc_account_name       text,
  dc_user_id            text,
  claimed_by_member_id  uuid references members(id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_legacy_identities_fb_nick on legacy_identities (lower(fb_nickname));
create index if not exists idx_legacy_identities_line_nick on legacy_identities (lower(line_nickname));
create index if not exists idx_legacy_identities_discord_nick on legacy_identities (lower(discord_nickname));
create index if not exists idx_legacy_identities_dc_account on legacy_identities (lower(dc_account_name));
create unique index if not exists idx_legacy_identities_fb_profile_url_norm on legacy_identities (fb_profile_url_norm) where fb_profile_url_norm is not null;
create index if not exists idx_legacy_identities_claimed_by on legacy_identities (claimed_by_member_id);

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

alter table orders add column if not exists legacy_identity_id uuid;
create index if not exists idx_orders_legacy_identity on orders (legacy_identity_id);
create unique index if not exists idx_orders_legacy_source_ref on orders (legacy_source_ref) where legacy_source_ref is not null;

-- 公告：可發佈多條，保留歷史紀錄
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_announcements_created_at on announcements (created_at desc);

-- 網站設定（key-value），第一個用途是結帳頁的說明欄
create table if not exists site_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);
