-- Add central-kitchen review workflow and optional photo linkage for expenses.

ALTER TABLE ck_daily_records
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'ck_daily_records'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE ck_daily_records DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE ck_daily_records
  ADD CONSTRAINT ck_daily_records_status_check
  CHECK (status IN ('draft', 'submitted', 'verified', 'disputed'));

ALTER TABLE ck_expense_items
  ADD COLUMN IF NOT EXISTS receipt_photo_url text;

COMMENT ON COLUMN ck_daily_records.review_note IS 'HQ review/reject note for central-kitchen daily record';
COMMENT ON COLUMN ck_daily_records.reviewed_at IS 'When HQ reviewed central-kitchen daily record';
COMMENT ON COLUMN ck_daily_records.reviewed_by IS 'HQ user who reviewed central-kitchen daily record';
COMMENT ON COLUMN ck_expense_items.receipt_photo_url IS 'Optional receipt photo URL linked to this expense item';
