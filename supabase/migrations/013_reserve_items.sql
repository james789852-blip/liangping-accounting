ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS reserve_items JSONB DEFAULT '[]'::jsonb;
