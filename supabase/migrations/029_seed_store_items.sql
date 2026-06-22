-- 每店 store_items 設定（啟用對應 system_items + sort_order）
-- 來源：對應原版 Excel 每店欄位順序
-- 全 idempotent — 重跑會更新 sort_order

-- 用法：每店都 INSERT ... ON CONFLICT (store_id, system_item_id) DO UPDATE

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 大直讚（66 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '大直讚' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 大直讚'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '豆腐-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '大陸妹' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '空心菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '山東白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '萬家香醬油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '油蔥酥' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '四兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '一斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '退貨' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'ICHEF' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 巷日（74 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '巷日' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 巷日'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 17, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 18, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '豆漿' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '雞蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '滷肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '上逸' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '空心菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '大白菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '油蔥酥' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '特沙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '吐司盒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '6吋圓盤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '五斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '醬料碟' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '吸管' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '佑康' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 幸福（87 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '幸福' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 幸福'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '豆漿' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '青江菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '小松' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '咖哩4' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '味霖' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '特砂' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '雜貨-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '320杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '2632蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '6吋圓盤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '4杯底座' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '6杯底座' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '二斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '三斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '二碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '退貨' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '菜單' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '洗劑' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 99, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 100, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 101, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 102, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 103, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 104, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 105, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 106, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 107, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 府中（81 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '府中' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 府中'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 18, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '退費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '菠菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '山東白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '地瓜葉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '味霖' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '油蔥酥' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '鹼片' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '吐司盒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '6吋圓盤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '醬料碟' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '300小抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '鐵刷' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '退貨取回' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '昇威稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '其他稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 99, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 100, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 心惦（84 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '心惦' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 心惦'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '豆漿' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '青江菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '菠菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '大陸妹' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '瑋茹-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '味霖' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '細特砂' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '一體小' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '360碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '90蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '吸管' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '6吋圓盤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '三斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '達特' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 99, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 100, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 101, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 102, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 103, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 104, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 景新（79 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '景新' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 景新'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '青江菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '包心白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '青江菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '瑋茹-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '紙杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '醬料連蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '五斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '退貨取回' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '菜單' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 99, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 梁鑫（75 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '梁鑫' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 梁鑫'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '大陸妹' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '菠菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '山東白菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = 'A菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '一體小' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '提圈' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '300小抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'ICHEF' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '其他稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = '管理費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 福城（91 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '福城' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 福城'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '豆漿' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '雞蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '蛋' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '蛋' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '豆腐-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '大A' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '山東白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '昀隆-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '咖哩4' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '味霖' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '特砂' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '雜貨-稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '紙粿盒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '205杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '320杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '2632蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '紙12杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '咖啡蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '4杯底座' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '6杯底座' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '三斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '一斤捲' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '鹼片' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '菜單' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '洗劑' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '樂清' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 101, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 102, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 103, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 104, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 105, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 106, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 107, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 108, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 109, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 110, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 111, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 鑫營（78 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '鑫營' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 鑫營'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 18, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '大白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '小白菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '大陸妹' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '折扣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '咖哩1' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '咖哩2' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '萬家香' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '味林' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '四方底' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '6吋圓盤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '六兩袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '五斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '牙籤' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '300抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '垃圾袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '鹼片' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '免洗稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '感熱稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '菜單' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '達特' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '其他稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 92, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 鑫耀鑫（106 個品項）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM stores WHERE name = '鑫耀鑫' LIMIT 1;
  IF sid IS NULL THEN RAISE NOTICE '⚠ 找不到 stores.name = 鑫耀鑫'; RETURN; END IF;
  -- 先停用所有現有 store_items，再啟用該店現用的（保證乾淨）
  UPDATE store_items SET enabled = false WHERE store_id = sid AND system_item_id IS NOT NULL;

  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 19, true FROM system_items si
  WHERE si.name = '雞腿' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 20, true FROM system_items si
  WHERE si.name = '雞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 21, true FROM system_items si
  WHERE si.name = '好吃醬' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 22, true FROM system_items si
  WHERE si.name = '雞湯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 23, true FROM system_items si
  WHERE si.name = '貢丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 24, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 25, true FROM system_items si
  WHERE si.name = '辣椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '央廚配送' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 26, true FROM system_items si
  WHERE si.name = '絞肉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '豬肉商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 27, true FROM system_items si
  WHERE si.name = '豬油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '豬肉商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 28, true FROM system_items si
  WHERE si.name = '細拉麵' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '麵' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 29, true FROM system_items si
  WHERE si.name = '麵線' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '麵' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 30, true FROM system_items si
  WHERE si.name = '餛飩皮' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '麵' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 31, true FROM system_items si
  WHERE si.name = '雞蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 32, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '振源' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 33, true FROM system_items si
  WHERE si.name = '油豆腐' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 34, true FROM system_items si
  WHERE si.name = '滷蛋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '小雲' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 35, true FROM system_items si
  WHERE si.name = '豆腐稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 36, true FROM system_items si
  WHERE si.name = '魚丸' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 37, true FROM system_items si
  WHERE si.name = '芹菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 38, true FROM system_items si
  WHERE si.name = '香菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 39, true FROM system_items si
  WHERE si.name = '蒜中' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 40, true FROM system_items si
  WHERE si.name = '蒜小仁' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 41, true FROM system_items si
  WHERE si.name = '蔥' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 42, true FROM system_items si
  WHERE si.name = '紅蔥頭' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 43, true FROM system_items si
  WHERE si.name = '高麗菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 44, true FROM system_items si
  WHERE si.name = '大陸妹' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 45, true FROM system_items si
  WHERE si.name = '白蘿蔔' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 46, true FROM system_items si
  WHERE si.name = '地瓜葉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 47, true FROM system_items si
  WHERE si.name = '山東白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 48, true FROM system_items si
  WHERE si.name = '油菜' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 49, true FROM system_items si
  WHERE si.name = '蚵白' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '菜商' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 50, true FROM system_items si
  WHERE si.name = '米' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 51, true FROM system_items si
  WHERE si.name = '咖哩1號' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 52, true FROM system_items si
  WHERE si.name = '咖哩2號' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 53, true FROM system_items si
  WHERE si.name = '金蘭醬油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 54, true FROM system_items si
  WHERE si.name = '特沙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 55, true FROM system_items si
  WHERE si.name = '沙拉油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 56, true FROM system_items si
  WHERE si.name = '香油' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 57, true FROM system_items si
  WHERE si.name = '白醋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 58, true FROM system_items si
  WHERE si.name = '味精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 59, true FROM system_items si
  WHERE si.name = '鹽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 60, true FROM system_items si
  WHERE si.name = '糯米粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 61, true FROM system_items si
  WHERE si.name = '白胡椒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '雜貨' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 62, true FROM system_items si
  WHERE si.name = '一體大' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 63, true FROM system_items si
  WHERE si.name = '吐司盒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 64, true FROM system_items si
  WHERE si.name = '900碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 65, true FROM system_items si
  WHERE si.name = '900蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 66, true FROM system_items si
  WHERE si.name = '850碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 67, true FROM system_items si
  WHERE si.name = '850蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 68, true FROM system_items si
  WHERE si.name = '390碗' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 69, true FROM system_items si
  WHERE si.name = '390蓋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 70, true FROM system_items si
  WHERE si.name = '一斤提袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 71, true FROM system_items si
  WHERE si.name = '一碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 72, true FROM system_items si
  WHERE si.name = '二碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 73, true FROM system_items si
  WHERE si.name = '三碗袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 74, true FROM system_items si
  WHERE si.name = '大一杯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 75, true FROM system_items si
  WHERE si.name = '三杯袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 76, true FROM system_items si
  WHERE si.name = '大六兩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 77, true FROM system_items si
  WHERE si.name = '半斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 78, true FROM system_items si
  WHERE si.name = '兩斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 79, true FROM system_items si
  WHERE si.name = '三斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 80, true FROM system_items si
  WHERE si.name = '五斤袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 81, true FROM system_items si
  WHERE si.name = '夾鏈袋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 82, true FROM system_items si
  WHERE si.name = '湯匙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 83, true FROM system_items si
  WHERE si.name = '筷子' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 84, true FROM system_items si
  WHERE si.name = '橡皮筋' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 85, true FROM system_items si
  WHERE si.name = '調味碟' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 86, true FROM system_items si
  WHERE si.name = '300小抽' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 87, true FROM system_items si
  WHERE si.name = '廚房紙巾' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 88, true FROM system_items si
  WHERE si.name = '洗碗精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 89, true FROM system_items si
  WHERE si.name = '漂白水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 90, true FROM system_items si
  WHERE si.name = '洗衣粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 91, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '免洗' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 93, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '惠敘' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 94, true FROM system_items si
  WHERE si.name = '感熱紙' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Uber' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 95, true FROM system_items si
  WHERE si.name = '感熱紙稅' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 96, true FROM system_items si
  WHERE si.name = '地墊' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 97, true FROM system_items si
  WHERE si.name = '洗手乳' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 98, true FROM system_items si
  WHERE si.name = '酒精' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 99, true FROM system_items si
  WHERE si.name = '網狀尿石' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = 'Duskin' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 100, true FROM system_items si
  WHERE si.name = '口罩' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 101, true FROM system_items si
  WHERE si.name = '手套' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 102, true FROM system_items si
  WHERE si.name = '酵素粉' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 103, true FROM system_items si
  WHERE si.name = '收據本' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 104, true FROM system_items si
  WHERE si.name = '水' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 105, true FROM system_items si
  WHERE si.name = '影印' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 106, true FROM system_items si
  WHERE si.name = '冷氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '翁師傅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 107, true FROM system_items si
  WHERE si.name = '消毒' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 108, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 109, true FROM system_items si
  WHERE si.name = '其他稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 110, true FROM system_items si
  WHERE si.name = 'X總發票' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '退稅' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 111, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 112, true FROM system_items si
  WHERE si.name = '其他' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 114, true FROM system_items si
  WHERE si.name = '天然氣' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 115, true FROM system_items si
  WHERE si.name = '瓦斯' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 116, true FROM system_items si
  WHERE si.name = '水費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 117, true FROM system_items si
  WHERE si.name = '電費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 118, true FROM system_items si
  WHERE si.name = '電話費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 119, true FROM system_items si
  WHERE si.name = '垃圾費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 120, true FROM system_items si
  WHERE si.name = '廚餘費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 121, true FROM system_items si
  WHERE si.name = '保險費' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 122, true FROM system_items si
  WHERE si.name = '房租' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 123, true FROM system_items si
  WHERE si.name = '稅金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 124, true FROM system_items si
  WHERE si.name = '獎金' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 125, true FROM system_items si
  WHERE si.name = '體檢費用' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
  INSERT INTO store_items (store_id, system_item_id, sort_order, enabled)
  SELECT sid, si.id, 126, true FROM system_items si
  WHERE si.name = '娛樂' AND si.vendor_group_id = (SELECT id FROM system_vendor_groups WHERE name = '未分類' LIMIT 1)
  ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true;
END $$;

NOTIFY pgrst, 'reload schema';