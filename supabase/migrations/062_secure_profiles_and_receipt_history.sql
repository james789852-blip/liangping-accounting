-- 062: 封鎖帳號自行提高權限，並鎖定已送出／已審核日期的收據。

-- user_profiles 內含 role、is_hq、store_ids 與所有管理權限旗標，
-- 不允許 authenticated 直接 UPDATE；所有合法變更一律走已重新驗證管理權限的 Server Action。
DO $$
DECLARE
  update_policy record;
BEGIN
  FOR update_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', update_policy.policyname);
  END LOOP;
END;
$$;

REVOKE UPDATE ON TABLE public.user_profiles FROM anon, authenticated;

-- 停用帳號不能再透過既有 JWT 取得角色、店家或總公司權限。
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE user_id = auth.uid()
    AND COALESCE(active, true) = true
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT store_ids
  FROM public.user_profiles
  WHERE user_id = auth.uid()
    AND COALESCE(active, true) = true
$$;

CREATE OR REPLACE FUNCTION public.is_hq_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_hq OR role = '老闆'
    FROM public.user_profiles
    WHERE user_id = auth.uid()
      AND COALESCE(active, true) = true
  ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_store_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_hq_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_store_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hq_user() TO authenticated;

-- 058 曾用 closing_id 鎖定 receipts；目前收據是以 store_id + business_date
-- 對應結帳日，因此改用日期判斷並移除舊 trigger。
DROP TRIGGER IF EXISTS trg_prevent_locked_closing_child_mutation ON public.receipts;

CREATE OR REPLACE FUNCTION public.receipt_business_date_is_locked(
  target_store_id uuid,
  target_business_date date
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daily_closings
    WHERE store_id = target_store_id
      AND business_date = target_business_date
      AND status IN ('submitted', 'verified')
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_date_locked boolean := false;
  new_date_locked boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_date_locked := public.receipt_business_date_is_locked(OLD.store_id, OLD.business_date);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_date_locked := public.receipt_business_date_is_locked(NEW.store_id, NEW.business_date);
  END IF;

  IF old_date_locked OR new_date_locked THEN
    RAISE EXCEPTION '此日期帳目已送出或已審核，請先退回後再修改收據'
      USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_receipt_mutation ON public.receipts;

CREATE TRIGGER trg_prevent_locked_receipt_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_receipt_mutation();

CREATE OR REPLACE FUNCTION public.receipt_id_is_locked(target_receipt_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.receipt_business_date_is_locked(store_id, business_date)
    FROM public.receipts
    WHERE id = target_receipt_id
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_receipt_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_receipt_locked boolean := false;
  new_receipt_locked boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_receipt_locked := public.receipt_id_is_locked(OLD.receipt_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_receipt_locked := public.receipt_id_is_locked(NEW.receipt_id);
  END IF;

  IF old_receipt_locked OR new_receipt_locked THEN
    RAISE EXCEPTION '此日期帳目已送出或已審核，請先退回後再修改收據品項'
      USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_receipt_item_mutation ON public.receipt_items;

CREATE TRIGGER trg_prevent_locked_receipt_item_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.receipt_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_receipt_item_mutation();

-- 函式只供資料庫 trigger 內部使用，不開放成 RPC endpoint。
REVOKE EXECUTE ON FUNCTION public.receipt_business_date_is_locked(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_locked_receipt_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.receipt_id_is_locked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_locked_receipt_item_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.prevent_locked_receipt_mutation() IS
  '不論來源角色，禁止異動 submitted/verified 結帳日期的收據；必須先退回為可修改狀態。';
