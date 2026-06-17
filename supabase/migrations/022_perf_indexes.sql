-- 效能稽核：補上熱路徑缺漏的索引
-- 影響：HQ 月視圖、店長 closing 頁、Excel 匯出、Google Sheets 同步

-- 1. receipts (store_id, business_date)：最熱查詢組合
-- 來源：food-cost-preview, closing page, food-cost export, google-sheets, hq closings, hq reviews
CREATE INDEX IF NOT EXISTS idx_receipts_store_date
  ON receipts(store_id, business_date);

-- 2. menu_videos (store_id, business_date)：HQ closings 每筆都查
CREATE INDEX IF NOT EXISTS idx_menu_videos_store_date
  ON menu_videos(store_id, business_date);

-- 3. cash_counts (closing_id)：manager closing 頁查
CREATE INDEX IF NOT EXISTS idx_cash_counts_closing
  ON cash_counts(closing_id);
