-- Add notes column to receipts table
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS notes text;
