-- 新增「線上點餐（含現金付款）」店面模式開關
-- 啟用後：店長結帳時可額外輸入一筆現金付款金額（負數），
-- 對應 Excel 「線上點餐(現金)」欄位
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS online_cash_enabled boolean NOT NULL DEFAULT false;
