-- 修正 item_column_mappings 的唯一索引，支援同一品名在不同店家有不同對應
-- 舊：item_name 全域唯一（無法支援店家自訂）
-- 新：全域記錄 (store_id IS NULL) 中 item_name 唯一；店家記錄中 (item_name, store_id) 唯一

ALTER TABLE item_column_mappings DROP CONSTRAINT IF EXISTS item_column_mappings_item_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_col_mappings_global
  ON item_column_mappings(item_name) WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_col_mappings_store_item
  ON item_column_mappings(item_name, store_id) WHERE store_id IS NOT NULL;
