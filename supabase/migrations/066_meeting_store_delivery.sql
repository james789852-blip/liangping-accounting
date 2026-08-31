-- 雙週店務會議：保存系統營業資料未包含的每日店內外送金額。

ALTER TABLE public.meeting_reports
  ADD COLUMN IF NOT EXISTS store_delivery_data jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.meeting_reports.store_delivery_data IS
  '管理人員依日期手動補登的店內外送營業額；報告比較時會納入總營業額與外送合計';

NOTIFY pgrst, 'reload schema';
