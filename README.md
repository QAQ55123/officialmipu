# 米舖訂購系統（Next.js + Supabase 重建版）

從 Google Apps Script + Google 試算表，改為完全獨立、脫離 Google 的架構：

| 原本 (GAS) | 現在 |
|---|---|
| Google 試算表 | Supabase (PostgreSQL) |
| `google.script.run` | Next.js API Routes |
| `LockService` | 資料庫層級操作（大流量時建議升級為 transaction，見下方「已知限制」） |
| `PropertiesService` | `.env.local` 環境變數 |
| GAS Web App 網址 | Vercel 部署網址（可綁自訂網域） |

## 一、建立 Supabase 專案（免費）

1. 到 https://supabase.com 註冊、建立新專案
2. 進入專案的 **SQL Editor**，貼上 `supabase/schema.sql` 的全部內容並執行（這會一併建好資料表和圖片儲存空間）
（⚠️ 如果你之前已經執行過一次舊版的 `schema.sql`，資料庫裡已經有資料了，不要重跑整份 schema.sql，改成依序執行 `supabase/migration_add_categories.sql` 和 `supabase/migration_add_storage.sql` 這兩個補丁檔即可，不會影響現有資料。）

3. 到 **Project Settings → API**，複製：
   - `Project URL` → 對應 `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → 對應 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → 對應 `SUPABASE_SERVICE_ROLE_KEY`（⚠️ 此金鑰有完整權限，絕對不能外流或放到前端）

## 二、本機測試

```bash
npm install
cp .env.local.example .env.local
# 編輯 .env.local，填入上面拿到的值
npm run dev
```

打開 http://localhost:3000 應該就能看到下單頁；http://localhost:3000/admin 是後台。

## 三、Email 功能（信箱驗證、忘記密碼）

用 [Resend](https://resend.com) 寄信，免費額度每月 3000 封，對這種規模的系統很夠用：

1. 到 https://resend.com 註冊帳號
2. 建立一組 **API Key**，填到 `RESEND_API_KEY`
3. 寄件地址 `EMAIL_FROM`：還沒有自己網域的話，先用 Resend 內建的測試地址 `onboarding@resend.dev` 即可（收件人看到的寄件人名稱可以自訂，例如 `米舖 <onboarding@resend.dev>`）；之後有自己的網域可以到 Resend 後台驗證網域，換成 `你的名字@你的網域`
4. `NEXT_PUBLIC_SITE_URL` 填你的正式網址（例如 `https://mibu-app.vercel.app`），寄出的信裡連結會用到這個網址

**後台管理者**：註冊時多填一個 Email，會收到一封驗證信；忘記密碼時到 `/admin/forgot-password` 輸入 Email 申請重設連結。

**一般會員**：註冊時 Email 是**選填**的，填了才能用 `/forgot-password` 找回密碼；沒填的話，前台原本「換裝置用預設密碼 0000 登入」的方式還是能用，不受影響。

## 四、管理者帳號怎麼運作（兩種權限等級）

後台不是「一組密碼大家共用」，改成**每個管理者有自己獨立的帳號密碼**，跟一般會員完全分開；而且分兩種權限等級：

| 等級 | 能做什麼 |
|---|---|
| **owner**（最高權限，通常就是你自己） | 分類/企劃/商品管理 ＋ 會員相關工具（疑似重複、合併會員、重設密碼） |
| **staff**（一般管理者） | 只能管理分類/企劃/商品，**看不到、也無法呼叫**會員相關工具（前端隱藏，後端 API 也會擋） |

**設定方式：**

1. 你自己先設定兩組邀請碼（寫在 `.env.local` / Vercel 環境變數）：
   - `ADMIN_INVITE_CODE_OWNER`：只給你自己或極少數信任的共同經營者
   - `ADMIN_INVITE_CODE_STAFF`：給一般協助管理商品/企劃的人
2. 把 `你的網站/admin/register` 這個網址，連同**對應的邀請碼**給對方——邀請碼決定他拿到的權限等級，對方在註冊畫面**不能自己選**權限
3. 對方輸入帳號、密碼、邀請碼，建立帳號後自動登入
4. 之後大家都是各自到 `你的網站/admin` 用自己的帳密登入
5. 登入後會拿到一張「通行證」（session），存在瀏覽器的 cookie 裡，**8 小時後會自動失效**，要求重新輸入帳密登入

會員資料本身如果需要手動修正，直接到 Supabase 的 Table Editor 改 `members` 表即可，不需要特地做一個編輯介面——這也是為什麼把這類危險操作限制在 owner 帳號的原因：一般管理者完全不該有機會動到會員資料。

另外還需要一組 **`ADMIN_TOKEN_SECRET`**：這是用來簽發、驗證上面那張「通行證」的密鑰，隨便打一串長的亂碼即可，只要不外流就好，不需要背下來。

管理者身分**跟會員（前台下單用的身分）完全無關**——同一個人如果想自己下單買東西，還是要跟一般客人一樣走 LINE/Discord/FB 的身分登記流程。

## 五、匯入原本的企劃 / 商品資料

不用再手動去 Supabase 後台一筆一筆打了——部署完成後，直接到 `/admin`（後台）頁面，用密碼登入，裡面有完整的：

- **分類管理**：新增/編輯/刪除分類與子分類（下拉選單選上層分類，不用碰 UUID）
- **企劃管理**：新增/編輯/刪除企劃，圖片直接選檔案上傳（存到 Supabase Storage，自動填好網址）
- **商品管理**：點企劃旁邊的「管理商品」，新增/編輯/刪除該企劃底下的商品款式，圖片一樣直接上傳

如果你還是想直接在 Supabase 後台的 Table Editor 手動編輯資料也可以，兩種方式互通，資料庫是同一份。

## 六、部署到 Vercel（免費）

1. 把這個資料夾 push 到你自己的 GitHub repo
2. 到 https://vercel.com 用 GitHub 登入，選擇這個 repo 匯入
3. 在 Vercel 專案的 **Settings → Environment Variables**，把 `.env.local` 裡的每一項都加進去
4. 部署完成後會拿到一個 `https://your-project.vercel.app` 網址；也可以在 Vercel 裡綁自訂網域

## 七、兩個前台（一般 / FB）怎麼處理

原本 GAS 版本是「複製兩個獨立專案」，一個設 `FRONTEND_MODE=MAIN`、一個設 `FRONTEND_MODE=FB`。
在這個新架構，建議做法：

- **選項 A（最簡單）**：直接部署兩次（兩個 Vercel 專案，指向同一個 Supabase），只有 `FRONTEND_MODE` 環境變數不同
- **選項 B**：改用網址參數或子網域判斷模式（例如 `fb.yourdomain.com`），但這需要再加一點程式邏輯，可以之後再擴充

## 八、已知限制 / 建議之後加強的地方

- **搶購時的併發鎖定**：原本 GAS 用 `LockService` 序列化寫入；目前版本沒有做到完全一致的鎖定，正常使用量沒問題，但如果會有「同時有 50 人搶最後 1 件」這種瞬間流量，建議之後加上 Supabase 的 Postgres function + `SELECT ... FOR UPDATE` 做真正的交易鎖定
- **備份**：原本「立即備份整份試算表」的功能，在 Postgres 世界對應的是 Supabase 內建的每日自動備份（免費方案有 7 天內的 Point-in-Time 概念，付費方案更完整），不需要自己刻備份按鈕
- **圖片放大 (lightbox)、分類篩選列**：目前簡化掉了，功能都還在（商品列表、訂單、歷史），但沒有原本那麼多細節動畫，之後可以再補
- **Discord 通知**：邏輯照搬，只要在 `.env.local` 填 `DISCORD_WEBHOOK_URL` 即可

## 檔案結構

```
app/
  page.tsx              主要下單頁（身分驗證／企劃列表／下單／歷史）
  admin/page.tsx         後台頁面
  api/
    plans/                企劃列表 + 詳細內容
    auth/                 註冊／登入／改密碼
    orders/                新增／查詢／編輯／取消訂單
    admin/                 疑似重複會員／合併／重設密碼
lib/
  supabase.ts            Supabase client
  util.ts                密碼雜湊、FB 網址正規化、訂單編號等工具
  discord.ts              Discord Webhook 通知
supabase/schema.sql       資料庫結構（貼到 Supabase SQL Editor 執行一次）
```
