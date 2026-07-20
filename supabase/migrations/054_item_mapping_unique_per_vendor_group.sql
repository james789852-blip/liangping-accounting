-- 同一店家可在不同廠商/分類下建立同名品項。
-- 例如「滷肉」可以同時存在於「上逸」與另一個廠商分類；
-- 但同一店、同一分類內仍維持唯一，避免 Excel 欄位重複。

DROP INDEX IF EXISTS idx_item_col_mappings_global;
DROP INDEX IF EXISTS idx_item_col_mappings_store_item;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_col_mappings_global_vendor_item
  ON item_column_mappings (item_name, COALESCE(vendor_group, ''))
  WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_col_mappings_store_vendor_item
  ON item_column_mappings (store_id, item_name, COALESCE(vendor_group, ''))
  WHERE store_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
