-- Store-specific actual vendor names for operational analysis.
-- Existing vendor_name remains the accounting/vendor group used by item mappings and Excel layout.

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS actual_vendor_name text;

COMMENT ON COLUMN receipts.actual_vendor_name IS
  '店家自行輸入的實際廠商名稱，用於廠商分析；vendor_name 仍保留作為廠商類別/收據設定欄位';

CREATE TABLE IF NOT EXISTS store_actual_vendors (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_group text NOT NULL DEFAULT '',
  name         text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, vendor_group, name)
);

CREATE INDEX IF NOT EXISTS idx_store_actual_vendors_store_group
  ON store_actual_vendors(store_id, vendor_group, active, sort_order, name);

ALTER TABLE store_actual_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all store_actual_vendors" ON store_actual_vendors;
CREATE POLICY "service role all store_actual_vendors"
  ON store_actual_vendors FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read store_actual_vendors" ON store_actual_vendors;
CREATE POLICY "authenticated read store_actual_vendors"
  ON store_actual_vendors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert store_actual_vendors" ON store_actual_vendors;
CREATE POLICY "authenticated insert store_actual_vendors"
  ON store_actual_vendors FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update store_actual_vendors" ON store_actual_vendors;
CREATE POLICY "authenticated update store_actual_vendors"
  ON store_actual_vendors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
