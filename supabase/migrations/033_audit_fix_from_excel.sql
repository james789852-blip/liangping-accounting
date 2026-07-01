-- 1. 新增缺失的 system_items（category 自動推斷，HQ 後台可調整）
-- 重跑安全：用 ON CONFLICT 與 NOT EXISTS

INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '咖哩1', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '雜貨'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '咖哩1'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '咖哩2', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '雜貨'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '咖哩2'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '洗手乳', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '洗手乳'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '酒精', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '酒精'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '口罩', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '口罩'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '酵素粉', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '酵素粉'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '菜單', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '菜單'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '影印', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '退稅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '影印'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '消毒', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '翁師傅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '消毒'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '其他', '雜項', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '翁師傅'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '其他'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '油豆腐', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '振源'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '油豆腐'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '豆漿', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '振源'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '豆漿'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '白莧菜', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '菜商'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '白莧菜'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '口罩', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '口罩'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '酵素粉', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '酵素粉'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '影印', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '影印'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '收據本', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '收據本'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '豆漿', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '央廚配送'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '豆漿'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '菜單', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '菜單'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '垃圾袋', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '垃圾袋'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '1斤袋', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '免洗'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '1斤袋'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '水', '耗材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = 'Duskin'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '水'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '油豆腐', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '蛋'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '油豆腐'
  );
INSERT INTO system_items (name, category, vendor_group_id, default_enabled, sort_order, active)
SELECT '雞蛋', '食材', vg.id, false, 100, true
FROM system_vendor_groups vg WHERE vg.name = '麵'
  AND NOT EXISTS (
    SELECT 1 FROM system_items si WHERE si.vendor_group_id = vg.id AND si.name = '雞蛋'
  );

-- 2. 啟用各店未啟用 / 重新啟用該店停用的品項

WITH targets (store_name, vg_name, item_name) AS (
  VALUES
  ('鑫營', '菜商', '魚丸'),
  ('鑫營', '菜商', '菠菜'),
  ('鑫營', '雜貨', '咖哩1'),
  ('鑫營', '雜貨', '咖哩2'),
  ('鑫營', '退稅', '洗手乳'),
  ('鑫營', '退稅', '酒精'),
  ('鑫營', '退稅', '口罩'),
  ('鑫營', '退稅', '酵素粉'),
  ('鑫營', '退稅', '菜單'),
  ('鑫營', '退稅', '影印'),
  ('鑫營', '翁師傅', '消毒'),
  ('鑫營', '翁師傅', '其他'),
  ('心惦', '振源', '油豆腐'),
  ('心惦', '振源', '豆漿'),
  ('心惦', '菜商', '山東白'),
  ('心惦', '雜貨', '咖哩1'),
  ('心惦', '雜貨', '咖哩2'),
  ('府中', '菜商', '魚丸'),
  ('府中', '菜商', '白莧菜'),
  ('府中', '雜貨', '咖哩1'),
  ('府中', '雜貨', '咖哩2'),
  ('府中', '免洗', '鹼片'),
  ('府中', 'Duskin', '洗手乳'),
  ('府中', 'Duskin', '酒精'),
  ('府中', 'Duskin', '口罩'),
  ('府中', 'Duskin', '酵素粉'),
  ('府中', 'Duskin', '影印'),
  ('府中', '翁師傅', '消毒'),
  ('大直讚', '振源', '油豆腐'),
  ('大直讚', '雜貨', '咖哩1'),
  ('大直讚', '雜貨', '咖哩2'),
  ('大直讚', '免洗', '六兩袋'),
  ('大直讚', '免洗', '鹼片'),
  ('大直讚', 'Uber', '感熱紙'),
  ('大直讚', 'Duskin', '酒精'),
  ('大直讚', 'Duskin', '口罩'),
  ('大直讚', 'Duskin', '酵素粉'),
  ('大直讚', 'Duskin', '收據本'),
  ('大直讚', 'Duskin', '影印'),
  ('大直讚', '翁師傅', '消毒'),
  ('巷日', '央廚配送', '豆漿'),
  ('巷日', '雜貨', '咖哩1'),
  ('巷日', '雜貨', '咖哩2'),
  ('巷日', '免洗', '吸管'),
  ('巷日', 'Duskin', '酒精'),
  ('幸福', '央廚配送', '豆漿'),
  ('幸福', '菜商', '菠菜'),
  ('幸福', '菜商', '山東白'),
  ('幸福', '雜貨', '咖哩1'),
  ('幸福', '免洗', '半斤袋'),
  ('幸福', '免洗', '鹼片'),
  ('景新', '雜貨', '咖哩1'),
  ('景新', '雜貨', '咖哩2'),
  ('景新', '免洗', '鹼片'),
  ('景新', 'Duskin', '酒精'),
  ('景新', 'Duskin', '口罩'),
  ('景新', 'Duskin', '酵素粉'),
  ('景新', 'Duskin', '菜單'),
  ('景新', 'Duskin', '垃圾袋'),
  ('景新', 'Duskin', '影印'),
  ('景新', '翁師傅', '消毒'),
  ('梁鑫', '菜商', '空心菜'),
  ('梁鑫', '雜貨', '咖哩1'),
  ('梁鑫', '雜貨', '咖哩2'),
  ('梁鑫', '免洗', '1斤袋'),
  ('梁鑫', '惠敘', '感熱紙'),
  ('梁鑫', 'Duskin', '口罩'),
  ('梁鑫', 'Duskin', '水'),
  ('梁鑫', 'Duskin', '影印'),
  ('梁鑫', '翁師傅', '消毒'),
  ('梁鑫', '翁師傅', '其他'),
  ('梁鑫', '退稅', '其他'),
  ('福城', '央廚配送', '豆漿'),
  ('福城', '蛋', '油豆腐'),
  ('福城', '菜商', '大陸妹'),
  ('福城', '菜商', '青江菜'),
  ('福城', '雜貨', '咖哩1'),
  ('鑫耀鑫', '麵', '雞蛋'),
  ('鑫耀鑫', '豆腐商', '油豆腐')
)
INSERT INTO store_items (store_id, system_item_id, enabled, sort_order)
SELECT s.id, i.id, true, 100
FROM targets t
JOIN stores s ON s.name = t.store_name
JOIN system_vendor_groups vg ON vg.name = t.vg_name
JOIN system_items i ON i.name = t.item_name AND i.vendor_group_id = vg.id
ON CONFLICT (store_id, system_item_id) WHERE system_item_id IS NOT NULL
DO UPDATE SET enabled = true;