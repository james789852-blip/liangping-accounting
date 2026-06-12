-- 014: 擴充 user_profiles 欄位，更新 role 約束

-- 1. 確保 is_hq 欄位存在（若已建立則略過）
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_hq boolean DEFAULT false;

-- 2. 新增員工序號與顯示職稱
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS title text;

-- 3. 更新 role check 約束（加入 老闆, 廠長, 副廠長）
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('店長','副店長','助理','顧問','經理','總監','老闆','廠長','副廠長'));

-- 4. 更新 is_hq_user() 改用 is_hq 欄位（而非 role 判斷）
CREATE OR REPLACE FUNCTION is_hq_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_hq OR role = '老闆' FROM user_profiles WHERE user_id = auth.uid()),
    false
  )
$$;

-- 5. 更新 user_profiles 的查詢權限：經理/總監/老闆 皆可查全部
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (
    user_id = auth.uid() OR get_my_role() IN ('經理','總監','老闆')
  );

DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (get_my_role() IN ('經理','總監','老闆'));
