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

-- 分類（兩層：分類 > 子分類。子分類的 parent_id 指向上層分類；頂層分類 parent_id 為 null）
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  parent_id     uuid references categories(id) on delete cascade,
  sort_order    int default 0,
  created_at    timestamptz default now()
);
alter table categories add column if not exists is_gift_category boolean not null default false; -- 是否為滿贈分類，勾選後底下新增系列時可選檔期自動建立滿贈系列/商品
create index if not exists idx_categories_parent on categories (parent_id);

-- 系列（原本「企劃清單」分頁，已改名為系列）
create table if not exists series (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,               -- 系列名稱
  image_url     text,                        -- 系列圖片
  visible_to    text[] default '{}',         -- 顯示對象，例如 {LINE,DC}；空陣列 = 全部看得到
  category_id   uuid references categories(id) on delete set null,  -- 歸屬的分類或子分類（可為任一層）
  promo_images  text[] default '{}',         -- 宣傳圖（可多張），顯示在商品頁最上方
  is_visible    boolean not null default true, -- 店家手動決定要不要顯示給顧客看，跟時間/檔期無關
  is_legacy_archive boolean not null default false, -- true＝舊資料匯入建立的封存系列（商品目錄不完整，前台不可點擊進入）
  sort_order    int default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_series_category on series (category_id);

-- 商品（原本每個系列分頁裡的價目表）
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  series_id       uuid not null references series(id) on delete cascade,
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

-- 收藏清單（會員收藏的系列）
create table if not exists favorites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  series_id     uuid not null references series(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (member_id, series_id)
);
create index if not exists idx_favorites_member on favorites (member_id);

-- 訂單（一張訂單一筆，品項另外存 order_items）
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           text not null unique,
  series_id            uuid references series(id) on delete set null,  -- 系列被刪除後，訂單仍然保留（只是不再連到那筆系列）
  series_name_snapshot text,                      -- 下單當下的系列名稱快照，不會因系列被刪而遺失
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
create index if not exists idx_orders_series on orders (series_id);
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
-- 這三個欄位是後來才加的，如果表在更早版本就已經建立過，
-- create table if not exists 不會補上新欄位，這裡明確用 alter table 補齊
alter table order_items add column if not exists unit_price_original numeric; -- 原幣（人民幣）單價快照
alter table order_items add column if not exists fx_rate numeric; -- 下單當下套用的匯率快照
alter table order_items add column if not exists has_discount_flag_snapshot boolean; -- 下單當下這個商品是否標記滿減(v)

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
  claimed_by_member_id  uuid references members(id) on delete set null,
  claimed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_legacy_identities_fb_nick on legacy_identities (lower(fb_nickname));
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

-- ============================================================
-- 檔期（Campaign）— 規格書 2.4~2.7 節，全新概念，跟系列(series)無關
-- 純粹是時間窗口：開放時間內可下單，時間外僅能瀏覽，跟商品/系列完全沒有關聯
-- ============================================================

create table if not exists campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,

  -- 2.4節：取付檔期總上限（可留空=不限），已用金額由系統自動累計，不是店家手動輸入
  cod_campaign_cap   numeric,
  cod_campaign_used  numeric not null default 0,
  -- 2.6節：8種交易組合，{匯款,取付} x {有滿減,無滿減} x {有滿贈,無滿贈}，各自可開關+各自匯率
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

  -- 2.7節：滿贈基礎單位、廠商單張採購單贈品上限（跟第3節拆單工具共用同一份設定）
  gift_base_unit         numeric not null default 100,
  vendor_order_gift_cap  int,

  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 滿贈款式登記（2.7節，綁在特定檔期底下，一對多關係，獨立成表）
create table if not exists gift_styles (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  style_name        text not null,
  threshold_amount  numeric not null,
  created_at        timestamptz default now()
);
-- image_url 是後來才加的欄位，如果表在更早版本就已經建立過，
-- create table if not exists 不會補上新欄位，這裡明確用 alter table 補齊
alter table gift_styles add column if not exists image_url text;
create index if not exists idx_gift_styles_campaign on gift_styles (campaign_id);

-- 2.4節：商品要加「是否開放取付」勾選欄位，預設打勾（開放）
alter table products add column if not exists cod_allowed boolean not null default true;
-- 2.6節：是否標記v(滿減)，決定結帳時套用8種匯率組合裡的哪一軌，不是給顧客看的折扣
alter table products add column if not exists has_discount_flag boolean not null default true;
-- 2.2/2.8節：每個款式各自的固定運費金額，CSV匯入時一併寫入，後台手動新增款式則需個別填寫
alter table products add column if not exists shipping_fee numeric not null default 0;
-- 自動建立滿贈商品時，直接記錄這個商品對應到哪一筆滿贈款式登記，拆單工具判斷「這個商品要不要算進採購需求」時依此欄位，不用回頭比對名稱/款式字串
alter table products add column if not exists linked_gift_style_id uuid references gift_styles(id) on delete set null;

alter table campaigns disable row level security;
-- fulfillment_status 是後來才加的欄位，如果 campaigns 表在更早版本就已經建立過，
-- create table if not exists 不會補上新欄位，這裡明確用 alter table 補齊
alter table campaigns add column if not exists fulfillment_status text; -- 已購買/運輸中/已到貨/已開賣場，店家手動選的顯示標記，顯示在該檔期底下每張訂單上，跟通知信無關
-- 滿贈系列商品要有自己獨立的取付額度上限，跟一般商品的取付上限(cod_campaign_cap)分開累計，互不影響
alter table campaigns add column if not exists gift_cod_campaign_cap numeric;
alter table campaigns add column if not exists gift_cod_campaign_used numeric not null default 0;

alter table gift_styles disable row level security;

-- 完全移除系列層級的取付上限機制（改用檔期層級的 campaigns.cod_campaign_cap，見2.4節）
-- 註：新版 series 表定義本來就沒有 cod_limit 這個欄位，這裡不需要再額外執行任何清理

-- 2.5節：訂單記錄下單當下屬於哪個檔期；2.7節：是否選滿贈、選了哪些款式各幾個
alter table orders add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table orders add column if not exists wants_gift boolean not null default true;

create table if not exists order_gift_selections (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  gift_style_id uuid references gift_styles(id) on delete set null,
  style_name_snapshot text, -- 款式被刪除後，訂單仍保留當初選的名稱
  qty           int not null,
  created_at    timestamptz default now()
);
-- image_url_snapshot 是後來才加的欄位，如果這張表在更早版本就已經建立過，
-- create table if not exists 不會補上新欄位，這裡明確用 alter table 補齊
alter table order_gift_selections add column if not exists image_url_snapshot text;
create index if not exists idx_order_gift_selections_order on order_gift_selections (order_id);
alter table order_gift_selections disable row level security;

-- ============================================================
-- 第3節：內部工具 — 廠商採購拆單最佳化
-- 3.2節：廠商規則設定，每個檔期各自一份
-- ============================================================

-- 折扣門檻表：純粹「採購單金額(人民幣) → 折扣多少錢」，跟滿贈完全無關，三平台共用同一份
create table if not exists vendor_discount_tiers (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  threshold_amount  numeric not null,  -- 採購單金額門檻，人民幣單位，例如 100/200/300/400
  discount_amount   numeric not null,  -- 對應的廠商折扣金額，人民幣單位，例如 15/30/50/65
  sort_order        int default 0,
  created_at        timestamptz default now()
);
create index if not exists idx_vendor_discount_tiers_campaign on vendor_discount_tiers (campaign_id);

-- 廠商採購平台：同一個檔期可以有好幾個平台（如A/B/C），各自的單筆採購單贈品總量上限不同
create table if not exists vendor_platforms (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  name                  text not null,
  order_gift_cap        int not null default 0, -- 這個平台每張採購單的贈品總量上限
  sort_order            int default 0, -- 店家自訂的優先順序：拆單決定新採購單送去哪個平台時，依此順序嘗試分配
  created_at            timestamptz default now()
);
create index if not exists idx_vendor_platforms_campaign on vendor_platforms (campaign_id);

-- 各平台對「滿贈款式登記」(gift_styles)裡每一個款式的上限（同一平台每個款式都填一樣的數字，等於「固定上限」）
create table if not exists vendor_platform_style_caps (
  id                uuid primary key default gen_random_uuid(),
  platform_id       uuid not null references vendor_platforms(id) on delete cascade,
  gift_style_id     uuid not null references gift_styles(id) on delete cascade,
  per_style_cap     int not null default 0,
  unique (platform_id, gift_style_id)
);
create index if not exists idx_vendor_platform_style_caps_platform on vendor_platform_style_caps (platform_id);

alter table vendor_discount_tiers disable row level security;
alter table vendor_platforms disable row level security;
alter table vendor_platform_style_caps disable row level security;

-- ============================================================
-- 3.3節：拆單主頁面 — 我方採購單
-- 這輪先做「店家手動建立採購單、指定平台、把商品品項分配進去、配置滿贈」這個核心工作流，
-- 自動最佳化建議演算法留待之後加強，這輪讓店家可以手動操作、且有正確的上限檢查
-- ============================================================

create table if not exists vendor_purchase_batches (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  platform_id       uuid references vendor_platforms(id) on delete set null,
  label             text, -- 店家自訂標籤，方便辨識（留空則用建立順序編號顯示）
  extra_adjustment  numeric not null default 0, -- 3.2節「額外調整加總」，可正可負，直接影響實收金額
  created_at        timestamptz default now()
);
create index if not exists idx_vendor_purchase_batches_campaign on vendor_purchase_batches (campaign_id);

-- 一張採購單裡的商品品項：對應某張顧客訂單裡的某個品項，可能只分配走其中一部分數量
-- （同一個 order_item 的其餘數量可能被分配進另一張採購單，因為拆分最小單位是「一件商品」）
create table if not exists vendor_purchase_batch_items (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references vendor_purchase_batches(id) on delete cascade,
  order_item_id   uuid not null references order_items(id) on delete cascade,
  qty             int not null,
  created_at      timestamptz default now()
);
create index if not exists idx_vendor_purchase_batch_items_batch on vendor_purchase_batch_items (batch_id);
create index if not exists idx_vendor_purchase_batch_items_order_item on vendor_purchase_batch_items (order_item_id);

-- 一張採購單配置了哪些滿贈款式、各自幾個（受平台的單筆總量上限＋各款式上限雙重限制）
create table if not exists vendor_purchase_batch_gifts (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references vendor_purchase_batches(id) on delete cascade,
  gift_style_id   uuid not null references gift_styles(id) on delete cascade,
  qty             int not null,
  created_at      timestamptz default now(),
  unique (batch_id, gift_style_id)
);
create index if not exists idx_vendor_purchase_batch_gifts_batch on vendor_purchase_batch_gifts (batch_id);

-- 額外採購紀錄（3.3節）：跟其他賣家/管道額外買到的現貨，用來抵掉贈品缺口，不強制走拆單
create table if not exists vendor_extra_purchases (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  gift_style_id   uuid references gift_styles(id) on delete set null,
  qty             int not null,
  note            text,
  created_at      timestamptz default now()
);
create index if not exists idx_vendor_extra_purchases_campaign on vendor_extra_purchases (campaign_id);

alter table vendor_purchase_batches disable row level security;
alter table vendor_purchase_batch_items disable row level security;
alter table vendor_purchase_batch_gifts disable row level security;
alter table vendor_extra_purchases disable row level security;

-- ============================================================
-- 保險機制：不管上面個別關閉RLS的語句有沒有漏掉、或是被 Supabase 專案設定
-- （Authentication → Policies → Enable RLS on new tables）自動重新打開，
-- 這裡動態抓出 public schema 底下「現有的所有表格」統一關閉一次，
-- 每次貼這份 schema.sql 都會自動執行，不用再額外手動關一次。
-- ============================================================
-- ============================================================
-- 3.5節：到貨追蹤（三層結構：我方採購單 → 廠商訂單編號 → 物流單號）
-- 顆粒度精確到「這筆商品/滿贈品項屬於哪一個物流單號」，只記到貨/未到貨兩態
-- ============================================================

-- 廠商訂單編號：一張我方採購單，可能被廠商拆成多筆廠商自己的訂單編號
create table if not exists vendor_order_numbers (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references vendor_purchase_batches(id) on delete cascade,
  order_number    text not null,
  created_at      timestamptz default now()
);
create index if not exists idx_vendor_order_numbers_batch on vendor_order_numbers (batch_id);

-- 物流單號：一個廠商訂單編號，可能又被拆成多個物流/運送單號分開寄出
create table if not exists vendor_shipments (
  id                      uuid primary key default gen_random_uuid(),
  vendor_order_number_id  uuid not null references vendor_order_numbers(id) on delete cascade,
  tracking_number         text,
  created_at              timestamptz default now()
);
create index if not exists idx_vendor_shipments_order_number on vendor_shipments (vendor_order_number_id);

-- 物流單號底下裝了哪些品項：可能是一般商品品項(batch_item_id)、也可能是滿贈品項(batch_gift_id)，
-- 兩者擇一，滿贈品項比照一般商品一樣要能被分配進物流單號、一樣追蹤到貨狀態
create table if not exists vendor_shipment_items (
  id              uuid primary key default gen_random_uuid(),
  shipment_id     uuid not null references vendor_shipments(id) on delete cascade,
  batch_item_id   uuid references vendor_purchase_batch_items(id) on delete cascade,
  batch_gift_id   uuid references vendor_purchase_batch_gifts(id) on delete cascade,
  qty             int not null,
  arrived         boolean not null default false,
  created_at      timestamptz default now(),
  check ((batch_item_id is not null and batch_gift_id is null) or (batch_item_id is null and batch_gift_id is not null))
);
create index if not exists idx_vendor_shipment_items_shipment on vendor_shipment_items (shipment_id);
create index if not exists idx_vendor_shipment_items_batch_item on vendor_shipment_items (batch_item_id);
create index if not exists idx_vendor_shipment_items_batch_gift on vendor_shipment_items (batch_gift_id);

alter table vendor_order_numbers disable row level security;
alter table vendor_shipments disable row level security;
alter table vendor_shipment_items disable row level security;

-- ============================================================
-- 保險機制：不管上面個別關閉RLS的語句有沒有漏掉、或是被 Supabase 專案設定
-- （Authentication → Policies → Enable RLS on new tables）自動重新打開，
-- 這裡動態抓出 public schema 底下「現有的所有表格」統一關閉一次，
-- 每次貼這份 schema.sql 都會自動執行，不用再額外手動關一次。
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
