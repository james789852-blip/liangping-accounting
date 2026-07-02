-- 品項對應加「是否納入退稅總額」欄位
-- 讓 vg（分類位置）和「退稅屬性」解耦：
--   vg 決定 xlsx 位置（例：豆腐稅金放小雲旁 → vg=小雲）
--   is_refund 決定是否納入「梁平退稅」總額（勾了就算，vg 隨意）
ALTER TABLE item_column_mappings
  ADD COLUMN IF NOT EXISTS is_refund boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN item_column_mappings.is_refund IS
  'true=納入梁平退稅總額計算（不依 vg 判別），false=一般品項';

-- 自動標記：既有 vg=退稅 的品項通通標為 is_refund=true
-- （之後 user 可以自由改 vg 到原廠商，is_refund 保留 true）
UPDATE item_column_mappings SET is_refund = true WHERE vendor_group = '退稅';
