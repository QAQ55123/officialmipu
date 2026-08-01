-- 身份名冊的 FB個人網址加上正規化欄位，避免 https/www/?locale=xx 這種網址參數差異
-- 被誤判成不同人，造成重複匯入建立出兩筆一樣的身份資料
-- 在 Supabase SQL Editor 執行一次即可

alter table legacy_identities add column if not exists fb_profile_url_norm text;

-- 把現有資料補上正規化欄位（簡易版正規化：拿掉開頭 http(s):// 、www.、問號後面的參數、結尾斜線）
update legacy_identities
set fb_profile_url_norm = regexp_replace(
  regexp_replace(
    regexp_replace(lower(trim(fb_profile_url)), '^https?://', ''),
    '^www\.', ''
  ),
  '[?#].*$', ''
)
where fb_profile_url_norm is null;

update legacy_identities
set fb_profile_url_norm = regexp_replace(fb_profile_url_norm, '/+$', '')
where fb_profile_url_norm is not null;

create unique index if not exists idx_legacy_identities_fb_profile_url_norm on legacy_identities (fb_profile_url_norm) where fb_profile_url_norm is not null;
