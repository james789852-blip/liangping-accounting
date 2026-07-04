-- Add note column to ck_expense_items for xlsx annotation output.

ALTER TABLE ck_expense_items
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN ck_expense_items.note IS '備注（xlsx 匯出時呈現附註效果）';
