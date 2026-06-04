-- 廠商細項模板（用於收據填寫時快速帶入品項）
CREATE TABLE IF NOT EXISTS vendor_item_templates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id   uuid NOT NULL REFERENCES receipt_vendors(id) ON DELETE CASCADE,
  item_name   text NOT NULL,
  unit        text NOT NULL DEFAULT '',
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 為 receipt_items 加入數量與單位欄位
ALTER TABLE receipt_items
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit     text    DEFAULT '';
