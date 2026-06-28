-- 031: 效能 — 補 daily_closings 常用查詢條件的複合索引
--
-- 觀察：HQ 介面（reviews / closings）和 manager dashboard 都頻繁
--   - WHERE store_id = ? AND status IN (...)
--   - WHERE business_date BETWEEN ? AND ?  AND status = 'verified'
--   - ORDER BY submitted_at DESC（pending 排程）
-- 目前 daily_closings 只有 PK + (store_id, business_date) unique，
-- 上述查詢容易走 seq scan。

CREATE INDEX IF NOT EXISTS idx_daily_closings_store_status
  ON daily_closings(store_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_closings_date_status
  ON daily_closings(business_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_daily_closings_submitted_at
  ON daily_closings(submitted_at DESC) WHERE submitted_at IS NOT NULL;

-- receipts 也常用 store_id + business_date（已有 idx_receipts_store_date），
-- 但 vendor_name 模糊查詢沒 index；視需要再加。
