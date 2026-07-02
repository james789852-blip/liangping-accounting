-- Add vendor_group + doc_type to ck_expense_items to support 3-tier header
-- (廠商群組 / 單據類型 / 品項) matching each CK's original Excel layout.

ALTER TABLE ck_expense_items
  ADD COLUMN IF NOT EXISTS vendor_group text,
  ADD COLUMN IF NOT EXISTS doc_type text;

CREATE INDEX IF NOT EXISTS ck_expense_items_vendor_group_idx
  ON ck_expense_items (vendor_group);

COMMENT ON COLUMN ck_expense_items.vendor_group IS '廠商群組（例：雞肉商、菜商、雜貨、翁師傅、退稅）';
COMMENT ON COLUMN ck_expense_items.doc_type IS '單據類型（發票/收據/估價單/公司開）';
