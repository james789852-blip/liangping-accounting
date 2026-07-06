-- Ensure the final petty cash verification data can be stored on daily closings.
-- Some production databases may have missed migration 018, so keep this as a
-- latest idempotent guard.

ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS petty_counts JSONB;
