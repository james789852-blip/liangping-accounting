-- 央廚每筆體系內／體系外叫貨，保存對應的配送單照片。
-- 使用陣列以支援同一張配送單有正反面或多頁的情況。

ALTER TABLE public.ck_store_orders
  ADD COLUMN IF NOT EXISTS delivery_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ck_store_orders.delivery_photo_urls IS
  '央廚上傳、供總公司逐筆核對叫貨金額的配送單照片 URL 清單';

NOTIFY pgrst, 'reload schema';
