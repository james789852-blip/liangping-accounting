-- 店面與央廚人員過去可能因舊版權限欄位或批次設定，殘留總公司功能權限。
-- 現行帳號模型以 is_hq / 老闆角色作為總公司身分的唯一依據。
update public.user_profiles
set
  can_manage_users = false,
  can_manage_stores = false,
  can_manage_store_settings = false,
  can_manage_ck_settings = false,
  can_manage_items = false,
  can_manage_store_items = false,
  can_manage_ck_items = false,
  can_manage_store_receipts = false,
  can_manage_ck_receipts = false,
  can_manage_ck_prices = false,
  can_review_closings = false,
  can_export_reports = false
where coalesce(is_hq, false) = false
  and role <> '老闆';
