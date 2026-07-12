-- 051: 允許小幫手角色建立帳號

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('店長','副店長','小幫手','助理','顧問','經理','總監','老闆','廠長','副廠長'));
