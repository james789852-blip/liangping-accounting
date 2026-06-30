-- 034: item_column_mappings 加 sort_order 欄位
-- 給「品項對應管理」頁面排序用

ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_item_col_mappings_sort
  ON item_column_mappings(store_id, sort_order);
