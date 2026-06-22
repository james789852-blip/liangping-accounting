-- 每間店自訂會議排程
-- meeting_anchor_date: 任一次會議日（基準）
-- meeting_frequency_days: 會議間隔天數（預設 14 = 雙週）
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS meeting_anchor_date date,
  ADD COLUMN IF NOT EXISTS meeting_frequency_days int NOT NULL DEFAULT 14;

NOTIFY pgrst, 'reload schema';
