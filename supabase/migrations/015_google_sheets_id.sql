-- Add google_sheets_id column to stores table for per-store Google Sheets sync
ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_sheets_id TEXT;
