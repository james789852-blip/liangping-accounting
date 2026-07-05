-- 042: 品項對應「每店獨立」所需欄位
--
-- 目標：讓 item_column_mappings 成為「每店唯一真實來源」，
--       把單據類型與類別排序收進 mapping 本身，切斷對
--       system_items / system_vendor_groups / store_items 的繼承與 fallback。
--
--   doc_type_override：該品項在該店的最終單據類型（Excel Row2）。
--                      明確值、不再 fallback 到 vendor_group.doc_type；NULL/空 = 無單據類型。
--   vg_sort_order    ：該店 vendor_group（類別）的排序，per-store，
--                      不再共用全域 system_vendor_groups.sort_order。

ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS doc_type_override text;

ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS vg_sort_order int DEFAULT 100;

COMMENT ON COLUMN item_column_mappings.doc_type_override IS
  '該品項在該店的單據類型（Excel Row2）。明確值、不 fallback 到 vendor_group；NULL/空=無單據類型';
COMMENT ON COLUMN item_column_mappings.vg_sort_order IS
  '該店 vendor_group（類別）排序，per-store，不再共用 system_vendor_groups.sort_order';

CREATE INDEX IF NOT EXISTS idx_item_col_mappings_vg_sort
  ON item_column_mappings(store_id, vg_sort_order);

NOTIFY pgrst, 'reload schema';
