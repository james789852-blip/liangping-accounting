-- Keep the user who submitted a central-kitchen daily record for HQ review.
ALTER TABLE ck_daily_records
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN ck_daily_records.submitted_by IS 'User who last submitted this central-kitchen daily record';
