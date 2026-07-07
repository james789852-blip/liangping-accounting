-- Central kitchen reimbursement handoff workflow.
-- HQ uploads envelope photos and marks reimbursement sent.
-- Central kitchen confirms handoff after checking the cash/envelope.

ALTER TABLE ck_daily_records
  ADD COLUMN IF NOT EXISTS hq_reimbursement_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hq_reimbursement_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ck_reimbursement_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ck_reimbursement_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ck_reimbursement_confirmed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN ck_daily_records.hq_reimbursement_photo_urls IS 'HQ reimbursement envelope photo URL list';
COMMENT ON COLUMN ck_daily_records.hq_reimbursement_sent_at IS 'When HQ sent reimbursement to central kitchen';
COMMENT ON COLUMN ck_daily_records.ck_reimbursement_confirmed IS 'Whether central kitchen confirmed reimbursement handoff';
COMMENT ON COLUMN ck_daily_records.ck_reimbursement_confirmed_at IS 'When central kitchen confirmed reimbursement handoff';
COMMENT ON COLUMN ck_daily_records.ck_reimbursement_confirmed_by IS 'User who confirmed reimbursement handoff';

NOTIFY pgrst, 'reload schema';
