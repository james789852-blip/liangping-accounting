-- Split store-facing and central-kitchen-facing management permissions.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_store_settings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_ck_settings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_store_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_ck_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_store_receipts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_ck_receipts boolean NOT NULL DEFAULT false;

-- Keep existing administrators working after the split.
UPDATE user_profiles
SET
  can_manage_store_settings = true,
  can_manage_ck_settings = true
WHERE can_manage_stores = true;

UPDATE user_profiles
SET
  can_manage_store_items = true,
  can_manage_ck_items = true,
  can_manage_store_receipts = true,
  can_manage_ck_receipts = true
WHERE can_manage_items = true;

COMMENT ON COLUMN user_profiles.can_manage_store_settings IS '是否能管理店面店家設定';
COMMENT ON COLUMN user_profiles.can_manage_ck_settings IS '是否能管理央廚店家設定';
COMMENT ON COLUMN user_profiles.can_manage_store_items IS '是否能管理店面品項對應';
COMMENT ON COLUMN user_profiles.can_manage_ck_items IS '是否能管理央廚品項對應';
COMMENT ON COLUMN user_profiles.can_manage_store_receipts IS '是否能管理店面收據廠商';
COMMENT ON COLUMN user_profiles.can_manage_ck_receipts IS '是否能管理央廚收據廠商';
