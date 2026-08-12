-- 雙週店務會議：逐位同仁分析與跨店支援

ALTER TABLE meeting_reports
  ADD COLUMN IF NOT EXISTS staff_members jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE meeting_action_items
  ADD COLUMN IF NOT EXISTS store_support_note text;

-- 將舊版「需要總部協助」內容保留並搬到新的跨店支援欄位。
UPDATE meeting_action_items
SET store_support_note = hq_support_note
WHERE store_support_note IS NULL
  AND hq_support_note IS NOT NULL
  AND btrim(hq_support_note) <> '';

NOTIFY pgrst, 'reload schema';
