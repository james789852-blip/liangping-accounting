-- 廠商細項模板加入單價欄位
ALTER TABLE vendor_item_templates
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;

-- 收據細項加入單價欄位
ALTER TABLE receipt_items
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
