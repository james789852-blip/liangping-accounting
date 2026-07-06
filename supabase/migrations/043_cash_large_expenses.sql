-- Add explicit large cash expenses to cash counts.
-- These are entered as positive amounts in the UI and deducted from counted cash.
ALTER TABLE cash_counts
  ADD COLUMN IF NOT EXISTS large_expenses jsonb NOT NULL DEFAULT '[]'::jsonb;
