-- ============================================================
-- 新網站資料庫 Schema（依規格書 v0.3 建立）
-- 會員系統獨立（不與 mibu-app 共用），使用 bcrypt + HMAC session
-- ============================================================

-- ------------------------------------------------------------
-- 0. 管理者帳號（後台用，跟 members 完全分開，互不影響）
-- ------------------------------------------------------------

-- 一次性邀請碼（給 staff 等級用；owner 用固定的環境變數邀請碼 ADMIN_INVITE_CODE_OWNER，不受影響）
create table if not exists admin_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  used boolean not null default false,
  used_by text,
  created_at timestamptz default now(),
  used_at timestamptz
);

-- role: 'owner'（最高權限，能碰會員相關工具）／'staff'（一般管理者，不能碰會員資料）
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text unique,
  email_verified boolean not null default false,
  password_hash text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  verify_token text,
  verify_token_expires timestamptz,
  reset_token text,
  reset_token_expires timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 1. 會員系統
-- ------------------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  email text,
  email_verified boolean default false,
  profile_url text,
  profile_url_norm text,
  pending_profile_url text,
  pending_profile_url_norm text,
  verify_token text,
  verify_token_expires timestamptz,
  reset_token text,
  reset_token_expires timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. 系列分類（含特殊「贈品/滿贈」系列）
-- ------------------------------------------------------------
create table if not exists series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_gift_series boolean default false, -- 標記是否為「贈品/滿贈」特殊系列
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 網站設定（如結帳頁提示文字），僅owner可改
create table if not exists site_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. 商品與款式
-- ------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id),
  name text not null,
  amount numeric not null, -- 商品原幣金額
  shipping_fee numeric not null default 0, -- 固定運費金額（CSV匯入或後台手動填寫）
  has_discount_flag boolean default false, -- CSV「是否滿減」欄位(v)：決定結帳時套用哪一軌匯率，非顧客可見折扣
  image_url text, -- 貼網址：支援一般圖床或 Google Drive 分享連結
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  style_name text, -- 留空 = 單一款式（無款式選項）
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. 檔期（Campaign）
-- ------------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- 如「男生宿舍第三彈訂購」，同時是分頁名稱
  opens_at timestamptz not null,
  closes_at timestamptz not null,

  -- 8 種交易組合：{匯款,取付} x {有滿減,無滿減} x {有滿贈,無滿贈}
  -- 是否啟用 + 匯率，各自獨立設定
  txn_bank_discount_gift_enabled boolean default true,
  txn_bank_discount_gift_rate numeric,
  txn_bank_discount_nogift_enabled boolean default true,
  txn_bank_discount_nogift_rate numeric,
  txn_bank_nodiscount_gift_enabled boolean default true,
  txn_bank_nodiscount_gift_rate numeric,
  txn_bank_nodiscount_nogift_enabled boolean default true,
  txn_bank_nodiscount_nogift_rate numeric,
  txn_cod_discount_gift_enabled boolean default true,
  txn_cod_discount_gift_rate numeric,
  txn_cod_discount_nogift_enabled boolean default true,
  txn_cod_discount_nogift_rate numeric,
  txn_cod_nodiscount_gift_enabled boolean default true,
  txn_cod_nodiscount_gift_rate numeric,
  txn_cod_nodiscount_nogift_enabled boolean default true,
  txn_cod_nodiscount_nogift_rate numeric,

  -- 取付檔期總上限（風險控管，非每單上限）；達標後自動關閉取付選項
  cod_campaign_cap numeric,
  cod_campaign_used numeric default 0,

  -- 滿贈：2.7 顧客端公式，無上限
  gift_base_unit numeric default 100, -- 總quota基礎單位

  -- 第3節內部拆單工具：廠商單張採購單贈品上限（供2.7即時試算與第3節共用同一份設定）
  vendor_order_gift_cap int,

  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 檔期 × 商品：多對多關聯，商品是獨立商品庫，檔期只是從庫裡「挑」商品進來賣
-- 同一個商品可以被挑進不同檔期重複銷售，不需要每次重建
create table if not exists campaign_products (
  campaign_id uuid references campaigns(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (campaign_id, product_id)
);

-- 滿贈款式登記表（2.7節，顧客端無上限公式；只需登記一次：名稱＋門檻金額）
create table if not exists gift_styles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  style_name text not null,
  threshold_amount numeric not null, -- 解鎖門檻 + 上限成長速度雙重用途
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 5. 訂單與品項
-- ------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  member_id uuid references members(id),
  txn_method text not null, -- 'bank' | 'cod'
  has_discount_flag boolean not null, -- 對應商品是否標記v，決定走哪個匯率軌
  wants_gift boolean default true, -- 購物車「是否要滿贈」，預設true
  fx_rate_snapshot numeric, -- 結帳當下套用的匯率快照
  cancel_requested_at timestamptz, -- 顧客申請取消訂單的時間，需最高權限管理者審核
  created_at timestamptz default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  qty int not null default 1,
  unit_amount_original numeric not null, -- 原幣單價
  unit_amount_twd numeric not null, -- ceil(原幣單價 × 匯率) 無條件進位後的台幣單價
  created_at timestamptz default now()
);

-- 訂單實際選擇的滿贈品項與數量（2.7 即時拆單試算結果）
create table if not exists order_gift_selections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  gift_style_id uuid references gift_styles(id),
  qty int not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 6. 出貨批次（以「訂單品項」為單位，非整張訂單）
-- ------------------------------------------------------------
create table if not exists shipping_batches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id), -- 批次仍歸屬同一張顧客訂單（不同批次可能同一張訂單多筆）
  confirmed_at timestamptz, -- 批次確定時間，決定何時對顧客顯示運費；null=尚未確定
  logistics_cost numeric, -- 實際物流成本，純內部欄位，不影響顧客金額
  created_at timestamptz default now()
);

create table if not exists shipping_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references shipping_batches(id) on delete cascade,
  order_item_id uuid references order_items(id),
  order_gift_selection_id uuid references order_gift_selections(id), -- 滿贈品項也可歸入批次（運費固定為0）
  created_at timestamptz default now()
);

-- ============================================================
-- 第 3 節：內部工具（廠商採購拆單最佳化）
-- ============================================================

-- 廠商贈品門檻金額與折扣金額（三平台共用同一份，店家自行輸入設定）
create table if not exists vendor_gift_tiers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  threshold_amount numeric not null, -- 如 100/200/300/400
  discount_amount numeric not null, -- 對應折扣，如 15/30/50/65
  sort_order int default 0
);

-- 平台清單（如 A/B/C 平台）
create table if not exists vendor_platforms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  name text not null,
  order_gift_cap int not null -- 該平台單張採購單贈品總量上限
);

-- 平台 × 門檻等級 × 每款上限（可能依門檻等級不同而不同，如 C 平台）
create table if not exists vendor_platform_tier_caps (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references vendor_platforms(id) on delete cascade,
  threshold_amount numeric not null, -- 對應 vendor_gift_tiers 的門檻等級
  per_style_cap int not null
);

-- 拆單批次（支援檔期中重複試算）
create table if not exists vendor_purchase_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  fx_rate numeric, -- 外幣換算台幣匯率；實際應與2.6的8種交易組合匯率共用同一份設定（見 campaigns 表）
  computed_at timestamptz default now(),
  is_final boolean default false -- false=試算預覽, true=正式拆單結果
);

-- 我方採購單（第3節拆單工具產生的一筆）
create table if not exists vendor_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references vendor_purchase_batches(id) on delete cascade,
  platform_id uuid references vendor_platforms(id), -- 可隨時更改，觸發重算
  adjustment_text text, -- 額外調整欄位原始輸入文字（如 "-20 -30"），系統解析加總得出調整金額
  created_at timestamptz default now()
);

-- 我方採購單品項（含可編輯對調的顧客欄位）
create table if not exists vendor_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references vendor_purchase_orders(id) on delete cascade,
  order_item_id uuid references order_items(id), -- 對應回原始顧客訂單品項
  customer_member_id uuid references members(id), -- 顧客欄位，可編輯對調（搜尋選單，只能選真實存在的顧客）
  reassignment_note text, -- 挪用註記：記錄該品項原本屬於哪位顧客、是否為拼湊來源
  qty int not null,
  unit_amount numeric not null
);

-- 該採購單實際配置的贈品（可手動編輯增減）
create table if not exists vendor_purchase_order_gifts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references vendor_purchase_orders(id) on delete cascade,
  gift_style_id uuid references gift_styles(id),
  qty int not null
);

-- 額外採購紀錄（超賣時去別處採購贈品的成本登記）
create table if not exists vendor_extra_purchases (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  order_ref text not null, -- 訂單編號/採購單號
  gift_style_id uuid references gift_styles(id),
  qty int not null,
  subtotal numeric not null, -- 小計/成本
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 到貨追蹤（三層結構：我方採購單 → 廠商訂單編號 → 物流單號）
-- ------------------------------------------------------------
create table if not exists vendor_order_numbers (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references vendor_purchase_orders(id) on delete cascade,
  vendor_order_no text not null -- 廠商給的訂單編號，如 A/B/C
);

create table if not exists vendor_shipments (
  id uuid primary key default gen_random_uuid(),
  vendor_order_number_id uuid references vendor_order_numbers(id) on delete cascade,
  tracking_no text not null, -- 物流單號
  arrived boolean default false -- 只記到貨/未到貨兩種簡單狀態
);

create table if not exists vendor_shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references vendor_shipments(id) on delete cascade,
  purchase_order_item_id uuid references vendor_purchase_order_items(id), -- 一般商品品項
  purchase_order_gift_id uuid references vendor_purchase_order_gifts(id) -- 滿贈品項也適用同一套到貨追蹤
  -- 上面兩個外鍵擇一使用（一列只對應一種類型）
);

-- ------------------------------------------------------------
-- 欠貨追蹤（跨顧客挪用商品後產生的補償紀錄）
-- ------------------------------------------------------------
create table if not exists backorders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  customer_member_id uuid references members(id), -- 欠貨對象
  gift_style_id uuid references gift_styles(id), -- 若為一般商品則改用 product_variant_id（依實作彈性擴充）
  product_variant_id uuid references product_variants(id),
  qty int not null,
  fulfilled boolean default false,
  created_at timestamptz default now() -- 決定優先補貨順序
);

-- ============================================================
-- ------------------------------------------------------------
-- 成本SHEET（自製簡易試算表，支援公式，不依賴有商業授權疑慮的第三方套件）
-- ------------------------------------------------------------
create table if not exists cost_sheets (
  campaign_id uuid primary key references campaigns(id) on delete cascade,
  data jsonb not null default '[]', -- 二維陣列，每格是原始輸入文字（公式以 = 開頭）
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 公告
-- ------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz default now()
);

-- 索引（依常用查詢路徑建立）
-- ============================================================
create index if not exists idx_campaign_products_product on campaign_products(product_id);
create index if not exists idx_products_series on products(series_id);
create index if not exists idx_orders_campaign on orders(campaign_id);
create index if not exists idx_orders_member on orders(member_id);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_shipping_batch_items_batch on shipping_batch_items(batch_id);
create index if not exists idx_vendor_purchase_order_items_order on vendor_purchase_order_items(purchase_order_id);
create index if not exists idx_vendor_shipment_items_shipment on vendor_shipment_items(shipment_id);
create index if not exists idx_backorders_campaign_fulfilled on backorders(campaign_id, fulfilled);
