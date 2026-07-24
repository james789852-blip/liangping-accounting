-- 056: 稅外加可明確指定「整個分類」或「單一品項」
ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS tax_scope text NOT NULL DEFAULT 'category',
  ADD COLUMN IF NOT EXISTS tax_target_item text;

ALTER TABLE item_column_mappings
  DROP CONSTRAINT IF EXISTS item_column_mappings_tax_scope_check;

ALTER TABLE item_column_mappings
  ADD CONSTRAINT item_column_mappings_tax_scope_check
  CHECK (tax_scope IN ('category', 'item'));

-- 舊資料先依既有命名自動帶入最合理的設定：
-- 只有同一店家／分類真的存在對應原始品項時，才視為單一品項稅金。
UPDATE item_column_mappings AS tax
SET tax_scope = 'item',
    tax_target_item = regexp_replace(tax.item_name, '\s*[-－—]\s*(稅金|稅)\s*$', '')
WHERE tax.is_tax_addon = true
  AND EXISTS (
    SELECT 1
    FROM item_column_mappings AS base
    WHERE base.store_id IS NOT DISTINCT FROM tax.store_id
      AND base.vendor_group IS NOT DISTINCT FROM tax.vendor_group
      AND base.is_tax_addon = false
      AND base.item_name = regexp_replace(tax.item_name, '\s*[-－—]\s*(稅金|稅)\s*$', '')
  );

-- 舊版每個分類只能有一筆稅外加，現在允許同分類多個指定品項稅金。
DROP INDEX IF EXISTS idx_item_mappings_one_tax_addon_per_vendor;

COMMENT ON COLUMN item_column_mappings.tax_scope IS
  'Tax addon scope: category applies to the vendor group; item applies only to tax_target_item';
COMMENT ON COLUMN item_column_mappings.tax_target_item IS
  'Original item name used when tax_scope=item';

NOTIFY pgrst, 'reload schema';
