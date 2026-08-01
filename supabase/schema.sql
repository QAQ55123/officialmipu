-- 檔期制訂購系統 — Supabase (PostgreSQL) schema
-- 以 mibu-app 原本的 schema 為基底，依《系統規格書 v0.3》調整
-- 在 Supabase 專案的 SQL Editor 貼上並執行一次即可建好所有資料表。

create extension if not exists "pgcrypto";

-- ============================================================
-- 管理者帳號（沿用 mibu-app 既有設計，原封不動）
-- ============================================================

create table if not exists admin_invite_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  used        boolean not null default false,
  used_by     text,
  created_at  timestamptz default now(),
  used_at     timestamptz
);

-- role: 'owner'（最高權限，能碰會員相關工具）／'staff'（一般管理者，不能碰會員資料）
create table if not exists admins (
  id                    uuid primary key default gen_random_uuid(),
  username              text not null unique,
  email                 text unique,
  email_verified        boolean not null default false,
  password_hash         text not null,
  role                  text not null default 'staff' check (role in ('owner', 'staff')),
  verify_token          text,
  verify_token_expires  timestamptz,
  reset_token           text,
  reset_token_expires   timestamptz,
  created_at            timestamptz default now()
);

-- ============================================================
-- 1. 會員系統（規格書第1節：完全獨立，不橋接 mibu-app）
-- 沿用 mibu-app 的 bcrypt + HMAC session 實作邏輯，欄位結構原封不動
-- 唯一調整：profile_url 改成選填（mibu-app 原本強制必填，新站規格沒有這個要求）
-- ============================================================

create table if not exists members (
  id                    uuid primary key default gen_random_uuid(),
  username              text not null,
  password_hash         text not null,
  profile_url           text,
  profile_url_norm      text,
  email                 text not null,
  email_verified        boolean not null default false,
  verify_token          text,
  verify_token_expires  timestamptz,
  reset_token           text,
  reset_token_expires   timestamptz,
  pending_profile_url      text,
  pending_profile_url_norm text,
  created_at            timestamptz default now()
);
create unique index if not exists idx_members_username on members (lower(username));
create unique index if not exists idx_members_email on members (lower(email));
create unique index if not exists idx_members_profile_url_norm on members (profile_url_norm) where profile_url_norm is not null;

-- ============================================================
-- 2.3 系列分類（商品的分類結構，商品直接歸屬系列）
-- ============================================================

create table if not exists series (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  is_gift_series boolean not null default false,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

-- ============================================================
-- 2.2 商品與款式（獨立商品庫，只歸屬系列，與檔期完全無關——規格書第5節明確沒有campaign關聯）
-- ============================================================

create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  series_id         uuid references series(id) on delete set null,
  name              text not null,
  sort_order        int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists idx_products_series on products (series_id);

-- 款式（比照 mibu-app 原本模式：每個款式各自有自己的金額/圖片/運費/取付設定，
-- 不是共用商品本身那一份；同一個商品名稱底下可以有好幾個款式，各自完全獨立）
create table if not exists product_variants (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete cascade,
  style_name        text,
  amount            numeric not null default 0,
  shipping_fee      numeric not null default 0,
  has_discount_flag boolean not null default false,
  cod_allowed       boolean not null default true,
  image_url         text,
  sort_order        int default 0,
  created_at        timestamptz default now()
);
create index if not exists idx_product_variants_product on product_variants (product_id);

-- ============================================================
-- 2.5 檔期（Campaign）—純粹時間窗口，跟商品/系列無任何關聯
-- 2.6 每個檔期8種交易組合各自啟用開關與匯率
-- 2.4 取付檔期總上限
-- ============================================================

create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,

  txn_bank_discount_gift_enabled      boolean not null default true,
  txn_bank_discount_gift_rate         numeric,
  txn_bank_discount_nogift_enabled    boolean not null default true,
  txn_bank_discount_nogift_rate       numeric,
  txn_bank_nodiscount_gift_enabled    boolean not null default true,
  txn_bank_nodiscount_gift_rate       numeric,
  txn_bank_nodiscount_nogift_enabled  boolean not null default true,
  txn_bank_nodiscount_nogift_rate     numeric,
  txn_cod_discount_gift_enabled       boolean not null default true,
  txn_cod_discount_gift_rate          numeric,
  txn_cod_discount_nogift_enabled     boolean not null default true,
  txn_cod_discount_nogift_rate        numeric,
  txn_cod_nodiscount_gift_enabled     boolean not null default true,
  txn_cod_nodiscount_gift_rate        numeric,
  txn_cod_nodiscount_nogift_enabled   boolean not null default true,
  txn_cod_nodiscount_nogift_rate      numeric,

  gift_base_unit         numeric not null default 100,
  vendor_order_gift_cap  int,
  cod_campaign_cap       numeric,
  cod_campaign_used      numeric not null default 0,

  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists gift_styles (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  style_name        text not null,
  threshold_amount  numeric not null,
  image_url         text,
  created_at        timestamptz default now()
);
create index if not exists idx_gift_styles_campaign on gift_styles (campaign_id);

-- ============================================================
-- 訂單與品項
-- ============================================================

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid references campaigns(id),
  member_id           uuid not null references members(id),
  txn_method          text not null check (txn_method in ('bank', 'cod')),
  wants_gift          boolean not null default true,
  cancel_requested_at timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_orders_campaign on orders (campaign_id);
create index if not exists idx_orders_member on orders (member_id);

create table if not exists order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders(id) on delete cascade,
  product_variant_id    uuid references product_variants(id),
  qty                   int not null default 1,
  unit_amount_original  numeric not null,
  unit_amount_twd       numeric not null,
  created_at            timestamptz default now()
);
create index if not exists idx_order_items_order on order_items (order_id);

create table if not exists order_gift_selections (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  gift_style_id uuid references gift_styles(id),
  qty           int not null,
  created_at    timestamptz default now()
);
create index if not exists idx_order_gift_selections_order on order_gift_selections (order_id);

-- ============================================================
-- 2.8 出貨批次：以「訂單品項」為最小單位歸類，不是整張訂單
-- ============================================================

create table if not exists shipping_batches (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  confirmed_at    timestamptz,
  logistics_cost  numeric,
  created_at      timestamptz default now()
);
create index if not exists idx_shipping_batches_order on shipping_batches (order_id);

create table if not exists shipping_batch_items (
  id                        uuid primary key default gen_random_uuid(),
  batch_id                  uuid not null references shipping_batches(id) on delete cascade,
  order_item_id             uuid references order_items(id),
  order_gift_selection_id   uuid references order_gift_selections(id),
  created_at                timestamptz default now()
);
create index if not exists idx_shipping_batch_items_batch on shipping_batch_items (batch_id);

-- ============================================================
-- 第3節：內部工具（廠商採購拆單最佳化）
-- ============================================================

create table if not exists vendor_gift_tiers (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  threshold_amount  numeric not null,
  discount_amount   numeric not null,
  sort_order        int default 0
);
create index if not exists idx_vendor_gift_tiers_campaign on vendor_gift_tiers (campaign_id);

create table if not exists vendor_platforms (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  name            text not null,
  order_gift_cap  int not null
);
create index if not exists idx_vendor_platforms_campaign on vendor_platforms (campaign_id);

create table if not exists vendor_platform_tier_caps (
  id                uuid primary key default gen_random_uuid(),
  platform_id       uuid not null references vendor_platforms(id) on delete cascade,
  threshold_amount  numeric not null,
  per_style_cap     int not null
);
create index if not exists idx_vendor_platform_tier_caps_platform on vendor_platform_tier_caps (platform_id);

create table if not exists vendor_purchase_batches (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id),
  fx_rate       numeric,
  computed_at   timestamptz default now(),
  is_final      boolean not null default false
);
create index if not exists idx_vendor_purchase_batches_campaign on vendor_purchase_batches (campaign_id);

create table if not exists vendor_purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references vendor_purchase_batches(id) on delete cascade,
  platform_id     uuid references vendor_platforms(id),
  adjustment_text text,
  created_at      timestamptz default now()
);
create index if not exists idx_vendor_purchase_orders_batch on vendor_purchase_orders (batch_id);

create table if not exists vendor_purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references vendor_purchase_orders(id) on delete cascade,
  order_item_id       uuid references order_items(id),
  customer_member_id  uuid references members(id),
  reassignment_note   text,
  qty                 int not null,
  unit_amount         numeric not null
);
create index if not exists idx_vendor_purchase_order_items_order on vendor_purchase_order_items (purchase_order_id);

create table if not exists vendor_purchase_order_gifts (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references vendor_purchase_orders(id) on delete cascade,
  gift_style_id       uuid references gift_styles(id),
  qty                 int not null
);
create index if not exists idx_vendor_purchase_order_gifts_order on vendor_purchase_order_gifts (purchase_order_id);

create table if not exists vendor_extra_purchases (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id),
  order_ref     text not null,
  gift_style_id uuid references gift_styles(id),
  qty           int not null,
  subtotal      numeric not null,
  created_at    timestamptz default now()
);
create index if not exists idx_vendor_extra_purchases_campaign on vendor_extra_purchases (campaign_id);

-- ------------------------------------------------------------
-- 3.5 到貨追蹤（三層：我方採購單 → 廠商訂單編號 → 物流單號）
-- ------------------------------------------------------------

create table if not exists vendor_order_numbers (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references vendor_purchase_orders(id) on delete cascade,
  vendor_order_no     text not null
);
create index if not exists idx_vendor_order_numbers_order on vendor_order_numbers (purchase_order_id);

create table if not exists vendor_shipments (
  id                      uuid primary key default gen_random_uuid(),
  vendor_order_number_id  uuid not null references vendor_order_numbers(id) on delete cascade,
  tracking_no             text not null,
  arrived                 boolean not null default false
);
create index if not exists idx_vendor_shipments_von on vendor_shipments (vendor_order_number_id);

create table if not exists vendor_shipment_items (
  id                        uuid primary key default gen_random_uuid(),
  shipment_id               uuid not null references vendor_shipments(id) on delete cascade,
  purchase_order_item_id    uuid references vendor_purchase_order_items(id),
  purchase_order_gift_id    uuid references vendor_purchase_order_gifts(id)
);
create index if not exists idx_vendor_shipment_items_shipment on vendor_shipment_items (shipment_id);

-- ------------------------------------------------------------
-- 欠貨追蹤
-- ------------------------------------------------------------

create table if not exists backorders (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id),
  customer_member_id  uuid references members(id),
  product_variant_id  uuid references product_variants(id),
  qty                 int not null,
  fulfilled           boolean not null default false,
  created_at          timestamptz default now()
);
create index if not exists idx_backorders_campaign_fulfilled on backorders (campaign_id, fulfilled);

-- ============================================================
-- 成本SHEET（自製簡易試算表，不用有商業授權疑慮的Handsontable/HyperFormula）
-- ============================================================

create table if not exists cost_sheets (
  campaign_id   uuid primary key references campaigns(id) on delete cascade,
  data          jsonb not null default '[]',
  updated_at    timestamptz default now()
);

-- ============================================================
-- 舊資料比對認領（FB名稱＋個人頁網址，沿用mibu-app邏輯）
-- ============================================================

create table if not exists legacy_identities (
  id                    uuid primary key default gen_random_uuid(),
  fb_profile_url        text not null,
  fb_profile_url_norm   text,
  fb_nickname           text,
  claimed_by_member_id  uuid references members(id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_legacy_identities_fb_nick on legacy_identities (lower(fb_nickname));
create unique index if not exists idx_legacy_identities_fb_profile_url_norm on legacy_identities (fb_profile_url_norm) where fb_profile_url_norm is not null;
create index if not exists idx_legacy_identities_claimed_by on legacy_identities (claimed_by_member_id);

-- ============================================================
-- 公告 / 網站設定（沿用mibu-app既有設計）
-- ============================================================

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_announcements_created_at on announcements (created_at desc);

create table if not exists site_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

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

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists trg_campaigns_updated_at on campaigns;
create trigger trg_campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

-- 商品圖片儲存空間（公開讀取，只有後台用 service role 金鑰才能上傳）
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- ============================================================
-- 明確關閉所有表格的 Row Level Security
-- 這個專案的權限判斷全部寫在後端 API 程式碼裡，不使用 Supabase RLS 機制。
-- ============================================================
alter table admin_invite_codes disable row level security;
alter table admins disable row level security;
alter table members disable row level security;
alter table series disable row level security;
alter table products disable row level security;
alter table product_variants disable row level security;
alter table campaigns disable row level security;
alter table gift_styles disable row level security;
alter table orders disable row level security;
alter table order_items disable row level security;
alter table order_gift_selections disable row level security;
alter table shipping_batches disable row level security;
alter table shipping_batch_items disable row level security;
alter table vendor_gift_tiers disable row level security;
alter table vendor_platforms disable row level security;
alter table vendor_platform_tier_caps disable row level security;
alter table vendor_purchase_batches disable row level security;
alter table vendor_purchase_orders disable row level security;
alter table vendor_purchase_order_items disable row level security;
alter table vendor_purchase_order_gifts disable row level security;
alter table vendor_extra_purchases disable row level security;
alter table vendor_order_numbers disable row level security;
alter table vendor_shipments disable row level security;
alter table vendor_shipment_items disable row level security;
alter table backorders disable row level security;
alter table cost_sheets disable row level security;
alter table legacy_identities disable row level security;
alter table announcements disable row level security;
alter table site_settings disable row level security;
