# 專案進度說明（以 mibu-app 為基底，依系統規格書 v0.3 重建）

這次是從你提供的最新 mibu-app 原始碼重新開始，不是憑空重寫。
每一項改動都對照過規格書段落，避免自己猜想。

## 已完成（跑過 tsc + build 驗證）

### 資料庫
- `supabase/schema.sql`：完整重建，對照規格書第5節逐條建立
- **商品／系列跟檔期完全無關聯**（這是這輪最重要的修正）：`products`/`product_variants` 只跟
  `series` 有關；`campaigns` 純粹是時間窗口，沒有任何商品關聯欄位；只有 `gift_styles`（滿贈）綁定檔期
- 明確關閉所有表格的 RLS（避免 Supabase 專案設定造成前台查詢被擋）

### 保留 mibu-app 原始基礎設施（未改動邏輯，只調整品牌文字／cookie名稱）
- 管理者帳號系統（owner/staff權限、邀請碼、忘記密碼、改密碼、改Email）
- 公告管理、網站設定、圖片上傳（Supabase Storage）

### 會員系統（規格書1節：完全獨立）
- 沿用 mibu-app 的 bcrypt+HMAC session 邏輯
- 個人頁網址改成**選填**（mibu-app原本必填，新站規格沒有這個要求）
- Cookie 名稱改過，不會跟 mibu-app 衝突

### 新建的核心業務邏輯（lib/）
- `giftQuota.ts`：2.7節滿贈公式＋拆單分組演算法
- `vendorPlatform.ts`：第3節多平台規則
- `txnRate.ts`：2.6節8種交易組合匯率解析
- `miniSheet.ts`：成本SHEET用的自製公式引擎（不用Handsontable/HyperFormula，避免授權問題）

### 新建的商品／系列 API（獨立商品庫，不需要檔期開放就能看）
- 後台：`/api/admin/series`、`/api/admin/products`（含CSV匯入、排序）
- 前台：`/api/series`、`/api/products`（公開瀏覽，不需要登入）
- `/api/campaigns/current`：查詢目前是否有開放中的檔期，前台用來判斷能不能加入購物車

## 尚未實作（下次繼續的方向，照優先順序）

1. **檔期管理 API**（8種交易組合CRUD）、**滿贈款式登記 API**
2. **購物車／結帳／訂單 API**：套用2.6的8種匯率、2.7的即時滿贈試算
3. **前台首頁重建**：商品優先瀏覽（不用先點進檔期），檔期只控制能不能加入購物車
4. **後台首頁重建**：單頁面＋側邊選單（比照 mibu-app 原本架構），把系列/商品/檔期/滿贈款式管理都放進去
5. **第3節拆單工具＋到貨追蹤＋欠貨追蹤**
6. **成本SHEET頁面**（miniSheet.ts 已經寫好，還沒接UI）
7. **舊資料比對認領**（FB名稱＋個人頁網址，schema已建好 `legacy_identities` 表，API還沒寫）
8. 訂單取消申請、到貨/開賣通知信

## 如何啟動

```bash
npm install
cp .env.local.example .env.local   # 填入你的 Supabase 專案資訊
# 到 Supabase SQL Editor 貼上 supabase/schema.sql 執行
npm run dev
```

## 這輪新完成（跑過 tsc + build 驗證）

- 商品加上 2.4節新增的 `cod_allowed`（是否開放取付，預設開放）
- 檔期管理 API（8種交易組合CRUD、排序）
- 滿贈款式登記 API（含圖片欄位，比照一般商品）
- 購物車即時滿贈試算 API（2.7節，用原幣金額不用台幣，避免匯率雞生蛋問題）
- 結帳試算 API（2.6節8種匯率＋2.4節商品層級取付開關檢查，列出被擋住的品項名稱）
- 訂單建立 API（同一張訂單不同商品可能套用不同匯率；取付時個別不開放取付的商品會擋住並列出品項名稱，不是整張訂單一起擋）
- 顧客訂單查詢／取消申請 API

## 尚未實作
1. **前台首頁重建**：商品優先瀏覽（不用先點進檔期）、購物車、結帳頁面
2. **後台首頁重建**：單頁面＋側邊選單
3. 第3節拆單工具＋到貨追蹤＋欠貨追蹤
4. 成本SHEET頁面
5. 舊資料比對認領

## 這輪：前台首頁真正做出來了（讀過原始碼才動手，不是憑印象）

實際讀過的原始碼段落：
- `app/page.tsx` 開頭 imports/state 結構
- 左側邊欄分類樹 `renderCategoryTree()`（第1100行附近）
- 購物車畫面 `view === "cart"`（第1854行附近）
- 結帳畫面 `view === "checkout"`（第1987行附近）
- 對應的 CSS class 定義（globals.css）：`.category-item`、`.plan-card-v2`、`.cart-item-row`、
  `.stepper`/`.step-btn`、`.source-btns`/`.src-btn`、`.style-pill`、`.cart-checkout-bar` 等

沿用這些真實的 CSS class 建成：
- `/`：商品優先瀏覽（左側邊欄放系列，不是頂部分頁，跟原始結構一致）＋購物車＋結帳，
  全部整合在同一個 `Home` 元件的 view 狀態機裡（比照原本的做法，不是拆成多頁）
- 商品有多款式時，用 `.style-pill` 選款式（不是下拉選單）
- `/login`、`/register`：顧客登入/註冊，沿用 `.auth-card`/`.id-row` 樣式
- 結帳頁會檢查登入狀態，未登入導去 `/login`

**已用 `npx tsc --noEmit` 與 `npm run build` 實際驗證，首頁 `/` 確實編譯出來（4.57 kB）。**

## 現在可以測試的完整路徑

1. 接 Supabase，貼 `schema.sql`
2. 到 Supabase Storage 建立 `product-images` public bucket
3. 到 `/admin`（目前還是「後台重建中」佔位頁，還不能用）—— **後台還沒做，只能用 API 直接操作資料庫，
   或先手動在 Supabase Table Editor 塞資料測試前台**
4. `/register` 註冊顧客帳號 → `/` 應該看到商品（如果 Supabase 裡有資料）→ 加入購物車 → 結帳

## 尚未實作
1. **後台首頁重建**（單頁面＋側邊選單，串接檔期/系列/商品/滿贈款式管理）—— 下一個最優先的項目，
   因為現在沒有後台就沒辦法透過網頁介面建立測試資料
2. 第3節拆單工具＋到貨追蹤＋欠貨追蹤
3. 成本SHEET頁面
4. 舊資料比對認領

## 這輪：後台真正做出來了（同樣先讀原始碼才動手）

實際讀過的原始碼段落：
- `app/admin/page.tsx` 開頭 state 結構、登入表單 JSX（第1341行附近）
- 側邊選單完整結構（第1365-1391行，`.category-sidebar-desktop.account-sidebar-active` + `.account-nav-item`）
- 帳號設定（第1397行附近）、分類管理（第1507行附近，拖曳排序+搜尋過濾模式）
- 商品管理（第1740行附近，縮圖+名稱+價格列表模式）
- 會員管理（第1908行附近）、邀請碼管理（第2092行附近）、公告管理（第2421行附近，
  發現「結帳頁說明欄」其實是跟公告合併在同一個分頁裡，不是獨立的「網站設定」分頁——
  已經照實際結構合併，不是我自己拆開的）

沿用這些真實結構建成 `/admin`：登入表單、側邊選單（帳號設定/系列管理/檔期管理/商品管理/
滿贈款式管理，owner專屬：訂單管理/會員管理/邀請碼管理/公告管理），全部用 `.auth-card`/`.id-row` 樣式。

**已用 `npx tsc --noEmit` 與 `npm run build` 實際驗證，`/admin` 確實編譯出來（7.9 kB）。**

## 現在真的可以測試完整路徑了

1. 接 Supabase，貼 `schema.sql`；到 Storage 建立 `product-images` public bucket
2. `/admin` 用 `ADMIN_INVITE_CODE_OWNER` 對應的邀請碼註冊第一個帳號（`/admin/register`）
3. 側邊選單：系列管理 → 建一個系列 → 商品管理 → 建幾個商品 → 檔期管理 → 建一個開放時間是現在的檔期
   → 滿贈款式管理（選剛剛的檔期）→ 登記幾個滿贈款式
4. 開無痕視窗，`/register` 註冊顧客帳號 → `/` 應該看到商品 → 加入購物車 → 結帳送出訂單
5. 回後台「訂單管理」選檔期看得到這張訂單

## 尚未實作
1. 訂單管理的「取消申請審核」還沒做（目前只有基本列表）
2. 第3節拆單工具＋到貨追蹤＋欠貨追蹤
3. 成本SHEET頁面
4. 舊資料比對認領
5. 一鍵重置所有資料（危險區）
