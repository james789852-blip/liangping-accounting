-- Separate central kitchen price management from general item mapping permissions.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_ck_prices boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.can_manage_ck_prices IS
  '是否能存取並修改央廚單價管理';

