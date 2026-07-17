ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS is_tax_addon boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN item_column_mappings.is_tax_addon IS
  'Hidden manager-entry item used as the manually entered external-tax line for its vendor group';

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_mappings_one_tax_addon_per_vendor
  ON item_column_mappings(store_id, vendor_group)
  WHERE is_tax_addon = true AND store_id IS NOT NULL AND vendor_group IS NOT NULL;

NOTIFY pgrst, 'reload schema';
