-- 把店長在「零用金核對」步驟輸入的鈔票/硬幣張數存進 DB，
-- 避免換裝置或清快取就消失。
--
-- 結構：{ counts: { bills_1000: N, ... }, lumps: { lump_1000: N, ... }, verified_at: ISO }

ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS petty_counts JSONB;
