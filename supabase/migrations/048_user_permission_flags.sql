-- Add granular permission flags to user_profiles.
-- Roles remain the default baseline; these flags grant specific HQ abilities
-- to users whose job title/role should stay lightweight, e.g. 助理.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_stores boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_review_closings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_reports boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.can_manage_stores IS
  '是否能存取並修改店家管理';

COMMENT ON COLUMN user_profiles.can_manage_items IS
  '是否能存取並修改品項/收據對應設定';

COMMENT ON COLUMN user_profiles.can_review_closings IS
  '是否能審核、退回或刪除帳目';

COMMENT ON COLUMN user_profiles.can_export_reports IS
  '是否能匯出管理報表/Excel';

