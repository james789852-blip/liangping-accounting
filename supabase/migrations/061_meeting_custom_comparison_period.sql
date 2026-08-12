-- 雙週店務會議：讓店家自行選擇兩個獨立的營業額比較區間

ALTER TABLE public.meeting_reports
  ADD COLUMN IF NOT EXISTS comparison_period_start date,
  ADD COLUMN IF NOT EXISTS comparison_period_end date;

-- 舊報告沿用原本「自動往前推同樣天數」的日期，之後可在頁面自行修改。
UPDATE public.meeting_reports
SET
  comparison_period_end = period_start - 1,
  comparison_period_start = period_start - ((period_end - period_start) + 1)
WHERE comparison_period_start IS NULL
   OR comparison_period_end IS NULL;

ALTER TABLE public.meeting_reports
  ALTER COLUMN comparison_period_start SET NOT NULL,
  ALTER COLUMN comparison_period_end SET NOT NULL;

ALTER TABLE public.meeting_reports
  DROP CONSTRAINT IF EXISTS meeting_reports_comparison_period_check;
ALTER TABLE public.meeting_reports
  ADD CONSTRAINT meeting_reports_comparison_period_check
  CHECK (comparison_period_start <= comparison_period_end);

NOTIFY pgrst, 'reload schema';
