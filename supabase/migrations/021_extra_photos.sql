-- 結帳新增「更多照片」(選填)：零用金核對 / 預付款項 等
-- 結構：[{ url: string, label: '零用金' | '預付款項' | string, note?: string }]
ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS extra_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
