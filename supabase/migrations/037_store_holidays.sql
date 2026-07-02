-- 店家公休日設定：讓「未結帳」提醒 / 對帳頁排除公休日

CREATE TABLE IF NOT EXISTS store_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS store_holidays_store_date_idx ON store_holidays (store_id, holiday_date);

COMMENT ON TABLE store_holidays IS '各店公休日（例：週一固定公休、國定假日、颱風臨時歇業）';
COMMENT ON COLUMN store_holidays.note IS '公休原因（選填）— 例：颱風、清明節、店長休假';
