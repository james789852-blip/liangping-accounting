-- 廠商群組是否跨 category 合併顯示
-- true  → 同 vg 內品項不管食/耗/雜都連續排（一個大 merge cell）
-- false → 依 category 分區（同 vg 可能被拆成多段）
ALTER TABLE system_vendor_groups
  ADD COLUMN IF NOT EXISTS merge_across_category boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN system_vendor_groups.merge_across_category IS
  'true=同 vg 品項連續合併；false=依 category 分區（vg 可能被拆）';
