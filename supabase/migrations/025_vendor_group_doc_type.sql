-- vendor_group 加 doc_type：用於 Excel row 2 標示「發票 / 收據 / 估價單 / 公司開」
ALTER TABLE system_vendor_groups
  ADD COLUMN IF NOT EXISTS doc_type text;

COMMENT ON COLUMN system_vendor_groups.doc_type IS 'Excel row 2 顯示的單據類型，例如 發票/收據/估價單/公司開';

NOTIFY pgrst, 'reload schema';
