-- 雙週店務會議報告：標準化欄位與可追蹤改善事項
-- 保留 026 建立的舊欄位，讓既有報告仍可讀取與匯出。

ALTER TABLE meeting_reports
  ADD COLUMN IF NOT EXISTS revenue_difference_note text,
  ADD COLUMN IF NOT EXISTS google_review_data jsonb NOT NULL DEFAULT '{"new_reviews":0,"average_rating":null,"summary":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS complaint_data jsonb NOT NULL DEFAULT '{"count":0,"category":"","description":"","resolution":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS vendor_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS staff_overview jsonb NOT NULL DEFAULT '{"staffing_status":"正常","training_needs":"","note":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS presenters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_step int NOT NULL DEFAULT 1;

ALTER TABLE meeting_reports
  DROP CONSTRAINT IF EXISTS meeting_reports_current_step_check;
ALTER TABLE meeting_reports
  ADD CONSTRAINT meeting_reports_current_step_check
  CHECK (current_step BETWEEN 1 AND 5);

ALTER TABLE meeting_action_items
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{"proposer_name":"","proposer_role":"店長","observation":"","impact":"","cause":"","solution":"","verification_method":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS progress_percent int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_note text,
  ADD COLUMN IF NOT EXISTS difficulty_note text,
  ADD COLUMN IF NOT EXISTS hq_support_note text,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE meeting_action_items
  DROP CONSTRAINT IF EXISTS meeting_action_items_progress_percent_check;
ALTER TABLE meeting_action_items
  ADD CONSTRAINT meeting_action_items_progress_percent_check
  CHECK (progress_percent BETWEEN 0 AND 100);

NOTIFY pgrst, 'reload schema';
