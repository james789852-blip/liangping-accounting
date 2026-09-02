-- 體系外店家可個別要求央廚在配送單之外，再附上轉帳成功紀錄。
-- 設定存於店家；每日訂單另存一份快照，避免日後切換設定影響舊帳目。

ALTER TABLE public.ck_external_stores
  ADD COLUMN IF NOT EXISTS transfer_photo_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.ck_store_orders
  ADD COLUMN IF NOT EXISTS transfer_photo_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ck_external_stores.transfer_photo_required IS
  'Whether new orders for this external customer require proof of successful bank transfer';

COMMENT ON COLUMN public.ck_store_orders.transfer_photo_required IS
  'Snapshot of the external-customer transfer-photo requirement when this daily order was saved';

COMMENT ON COLUMN public.ck_store_orders.transfer_photo_urls IS
  'Central-kitchen proof-of-transfer photo URL list for this external order';

NOTIFY pgrst, 'reload schema';
