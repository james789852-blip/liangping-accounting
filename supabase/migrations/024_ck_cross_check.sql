-- 央廚交叉對帳：央廚端可獨立輸入該店配送金額，與店家自報金額比對
-- 不一致時系統警示，避免店家輸入錯誤直接同步到央廚帳目

ALTER TABLE ck_store_orders
  ADD COLUMN IF NOT EXISTS ck_confirmed_amount numeric;

ALTER TABLE ck_store_orders
  ADD COLUMN IF NOT EXISTS ck_confirmed_at timestamptz;

ALTER TABLE ck_store_orders
  ADD COLUMN IF NOT EXISTS ck_confirmed_by uuid;

COMMENT ON COLUMN ck_store_orders.amount IS '店家自報金額（由店長端結帳同步）';
COMMENT ON COLUMN ck_store_orders.ck_confirmed_amount IS '央廚對帳金額（央廚管理人員輸入）';

NOTIFY pgrst, 'reload schema';
