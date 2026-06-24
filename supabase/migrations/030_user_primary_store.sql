-- 030: user_profiles 新增「主要所屬店面」欄位
-- 用途：管理人員（顧問/經理/總監）可以管理多店，但需要一個「歸屬主店」
--       登入時預設以該主店為 viewing context。
--       店長/副店長/廠長/副廠長 通常只有一家店，主店即唯一店。

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS primary_store_id UUID
  REFERENCES stores(id) ON DELETE SET NULL;

COMMENT ON COLUMN user_profiles.primary_store_id IS
  '使用者的主要所屬店面；登入時預設以此店為 viewing 店家。可為 null（如：老闆、未指派的總公司員工）。';

-- 對既有資料：若該人員 store_ids 僅一家店，回填為 primary
UPDATE user_profiles
SET primary_store_id = store_ids[1]
WHERE primary_store_id IS NULL
  AND store_ids IS NOT NULL
  AND array_length(store_ids, 1) = 1;
