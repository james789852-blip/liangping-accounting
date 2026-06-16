-- Add photo upload fields to daily_closings
ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS envelope_photo_url text,
  ADD COLUMN IF NOT EXISTS void_invoice_photo_urls jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS note_photo_url text;
