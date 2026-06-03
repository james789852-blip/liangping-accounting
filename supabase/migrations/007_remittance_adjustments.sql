ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS remittance_adjustments JSONB DEFAULT '[]'::jsonb;
