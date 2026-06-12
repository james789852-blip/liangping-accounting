-- 品項對應加入 store_id，NULL = 全域預設（適用所有店）
ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE CASCADE;

-- 建立索引加速查詢
CREATE INDEX IF NOT EXISTS idx_item_col_mappings_store ON item_column_mappings(store_id);
