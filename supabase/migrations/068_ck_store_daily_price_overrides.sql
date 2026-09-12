-- 總公司可為「單一店家 + 單一營業日 + 單一央廚品項」設定特例單價。
-- 叫貨明細仍會把實際採用的單價存入 order_items，確保日後全域價格或特例變更時
-- 已完成的歷史帳目不會被回溯改寫。

CREATE TABLE IF NOT EXISTS public.central_kitchen_price_overrides (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  central_kitchen_price_id uuid NOT NULL
    REFERENCES public.central_kitchen_prices(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  reason text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, business_date, central_kitchen_price_id)
);

CREATE INDEX IF NOT EXISTS idx_ck_price_overrides_store_date
  ON public.central_kitchen_price_overrides(store_id, business_date);

COMMENT ON TABLE public.central_kitchen_price_overrides IS
  'HQ-managed central-kitchen price exceptions effective for exactly one store business date';
COMMENT ON COLUMN public.central_kitchen_price_overrides.business_date IS
  'The only business date on which this store-specific price is effective';

ALTER TABLE public.central_kitchen_price_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.central_kitchen_price_overrides FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.central_kitchen_price_overrides FROM authenticated;
GRANT SELECT ON TABLE public.central_kitchen_price_overrides TO authenticated;

DROP POLICY IF EXISTS ck_price_overrides_scoped_select
  ON public.central_kitchen_price_overrides;
CREATE POLICY ck_price_overrides_scoped_select
  ON public.central_kitchen_price_overrides
  FOR SELECT TO authenticated
  USING (public.can_access_store_uuid(store_id));

NOTIFY pgrst, 'reload schema';
