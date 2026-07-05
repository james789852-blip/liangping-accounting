-- Add can_manage_users permission flag to user_profiles.
-- Boss role (老闆) always has access; others need this flag = true.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_users boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.can_manage_users IS
  '是否能存取帳號管理頁面（老闆一定有，其他角色需個別授權）';
