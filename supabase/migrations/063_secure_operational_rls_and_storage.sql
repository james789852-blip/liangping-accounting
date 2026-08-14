-- 063: 依店家隔離營運資料與照片寫入權限。
-- Service role 仍可供已完成授權檢查的 Server Actions 使用；anon 不得直接存取。

CREATE OR REPLACE FUNCTION public.can_access_store_uuid(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_hq_user()
    OR target_store_id = ANY(COALESCE(public.get_my_store_ids(), ARRAY[]::uuid[]))
$$;

CREATE OR REPLACE FUNCTION public.can_manage_item_mappings_for_store(target_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_hq_user() OR COALESCE((
    SELECT CASE
      WHEN COALESCE(s.type, '店面') = '央廚' THEN p.can_manage_ck_items
      ELSE p.can_manage_store_items
    END
    FROM public.user_profiles p
    JOIN public.stores s ON s.id = target_store_id
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.active, true) = true
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_access_storage_store(target_store_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_hq_user()
    OR target_store_id = ANY(COALESCE(public.get_my_store_ids()::text[], ARRAY[]::text[]))
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_store_uuid(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_item_mappings_for_store(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_storage_store(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store_uuid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_item_mappings_for_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_storage_store(text) TO authenticated;

ALTER TABLE public.meeting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_actual_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ck_daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ck_store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ck_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ck_external_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_row record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'meeting_reports', 'meeting_action_items', 'receipts', 'receipt_items',
    'receipt_categories', 'receipt_vendors', 'store_actual_vendors',
    'item_column_mappings', 'ck_daily_records', 'ck_store_orders',
    'ck_expense_items', 'ck_external_stores', 'audit_logs'
  ]
  LOOP
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.meeting_reports FROM anon;
REVOKE ALL ON TABLE public.meeting_action_items FROM anon;
REVOKE ALL ON TABLE public.receipts FROM anon;
REVOKE ALL ON TABLE public.receipt_items FROM anon;
REVOKE ALL ON TABLE public.receipt_categories FROM anon;
REVOKE ALL ON TABLE public.receipt_vendors FROM anon;
REVOKE ALL ON TABLE public.store_actual_vendors FROM anon;
REVOKE ALL ON TABLE public.item_column_mappings FROM anon;
REVOKE ALL ON TABLE public.ck_daily_records FROM anon;
REVOKE ALL ON TABLE public.ck_store_orders FROM anon;
REVOKE ALL ON TABLE public.ck_expense_items FROM anon;
REVOKE ALL ON TABLE public.ck_external_stores FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM anon;

CREATE POLICY meeting_reports_store_select ON public.meeting_reports
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_reports_store_insert ON public.meeting_reports
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_reports_store_update ON public.meeting_reports
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_reports_store_delete ON public.meeting_reports
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY meeting_actions_store_select ON public.meeting_action_items
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_actions_store_insert ON public.meeting_action_items
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_actions_store_update ON public.meeting_action_items
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY meeting_actions_store_delete ON public.meeting_action_items
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY receipts_store_select ON public.receipts
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY receipts_store_insert ON public.receipts
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY receipts_store_update ON public.receipts
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY receipts_store_delete ON public.receipts
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY receipt_items_store_select ON public.receipt_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_items.receipt_id
      AND public.can_access_store_uuid(r.store_id)
  ));
CREATE POLICY receipt_items_store_insert ON public.receipt_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_items.receipt_id
      AND public.can_access_store_uuid(r.store_id)
  ));
CREATE POLICY receipt_items_store_update ON public.receipt_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_items.receipt_id
      AND public.can_access_store_uuid(r.store_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_items.receipt_id
      AND public.can_access_store_uuid(r.store_id)
  ));
CREATE POLICY receipt_items_store_delete ON public.receipt_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_items.receipt_id
      AND public.can_access_store_uuid(r.store_id)
  ));

CREATE POLICY receipt_categories_store_select ON public.receipt_categories
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY receipt_categories_store_insert ON public.receipt_categories
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY receipt_categories_store_update ON public.receipt_categories
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY receipt_categories_store_delete ON public.receipt_categories
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY receipt_vendors_store_select ON public.receipt_vendors
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY receipt_vendors_store_insert ON public.receipt_vendors
  FOR INSERT TO authenticated WITH CHECK (
    public.can_access_store_uuid(store_id)
    AND EXISTS (
      SELECT 1 FROM public.receipt_categories c
      WHERE c.id = receipt_vendors.category_id AND c.store_id = receipt_vendors.store_id
    )
  );
CREATE POLICY receipt_vendors_store_update ON public.receipt_vendors
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (
    public.can_access_store_uuid(store_id)
    AND EXISTS (
      SELECT 1 FROM public.receipt_categories c
      WHERE c.id = receipt_vendors.category_id AND c.store_id = receipt_vendors.store_id
    )
  );
CREATE POLICY receipt_vendors_store_delete ON public.receipt_vendors
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY actual_vendors_store_select ON public.store_actual_vendors
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(store_id));
CREATE POLICY actual_vendors_store_insert ON public.store_actual_vendors
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY actual_vendors_store_update ON public.store_actual_vendors
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(store_id))
  WITH CHECK (public.can_access_store_uuid(store_id));
CREATE POLICY actual_vendors_store_delete ON public.store_actual_vendors
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(store_id));

CREATE POLICY item_mappings_scoped_select ON public.item_column_mappings
  FOR SELECT TO authenticated USING (
    store_id IS NULL
    OR public.can_access_store_uuid(store_id)
    OR public.can_manage_item_mappings_for_store(store_id)
  );
CREATE POLICY item_mappings_managed_insert ON public.item_column_mappings
  FOR INSERT TO authenticated WITH CHECK (
    (store_id IS NULL AND public.is_hq_user())
    OR (store_id IS NOT NULL AND public.can_manage_item_mappings_for_store(store_id))
  );
CREATE POLICY item_mappings_managed_update ON public.item_column_mappings
  FOR UPDATE TO authenticated USING (
    (store_id IS NULL AND public.is_hq_user())
    OR (store_id IS NOT NULL AND public.can_manage_item_mappings_for_store(store_id))
  ) WITH CHECK (
    (store_id IS NULL AND public.is_hq_user())
    OR (store_id IS NOT NULL AND public.can_manage_item_mappings_for_store(store_id))
  );
CREATE POLICY item_mappings_managed_delete ON public.item_column_mappings
  FOR DELETE TO authenticated USING (
    (store_id IS NULL AND public.is_hq_user())
    OR (store_id IS NOT NULL AND public.can_manage_item_mappings_for_store(store_id))
  );

CREATE POLICY ck_records_store_select ON public.ck_daily_records
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_records_store_insert ON public.ck_daily_records
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_records_store_update ON public.ck_daily_records
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(ck_store_id))
  WITH CHECK (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_records_store_delete ON public.ck_daily_records
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(ck_store_id));

CREATE POLICY ck_orders_scoped_select ON public.ck_store_orders
  FOR SELECT TO authenticated USING (
    public.can_access_store_uuid(store_id)
    OR EXISTS (
      SELECT 1 FROM public.ck_daily_records r
      WHERE r.id = ck_store_orders.ck_daily_record_id
        AND public.can_access_store_uuid(r.ck_store_id)
    )
  );
CREATE POLICY ck_orders_ck_insert ON public.ck_store_orders
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_store_orders.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));
CREATE POLICY ck_orders_ck_update ON public.ck_store_orders
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_store_orders.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_store_orders.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));
CREATE POLICY ck_orders_ck_delete ON public.ck_store_orders
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_store_orders.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));

CREATE POLICY ck_expenses_store_select ON public.ck_expense_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_expense_items.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));
CREATE POLICY ck_expenses_store_insert ON public.ck_expense_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_expense_items.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));
CREATE POLICY ck_expenses_store_update ON public.ck_expense_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_expense_items.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_expense_items.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));
CREATE POLICY ck_expenses_store_delete ON public.ck_expense_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ck_daily_records r
    WHERE r.id = ck_expense_items.ck_daily_record_id
      AND public.can_access_store_uuid(r.ck_store_id)
  ));

CREATE POLICY ck_external_store_select ON public.ck_external_stores
  FOR SELECT TO authenticated USING (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_external_store_insert ON public.ck_external_stores
  FOR INSERT TO authenticated WITH CHECK (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_external_store_update ON public.ck_external_stores
  FOR UPDATE TO authenticated USING (public.can_access_store_uuid(ck_store_id))
  WITH CHECK (public.can_access_store_uuid(ck_store_id));
CREATE POLICY ck_external_store_delete ON public.ck_external_stores
  FOR DELETE TO authenticated USING (public.can_access_store_uuid(ck_store_id));

CREATE POLICY audit_logs_hq_select ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_hq_user());
CREATE POLICY audit_logs_own_insert ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND (store_id IS NULL OR public.can_access_store_uuid(store_id))
  );

-- 移除先前對 receipts / meeting-reports bucket 的寬鬆 policy。
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%receipts%'
        OR COALESCE(with_check, '') ILIKE '%receipts%'
        OR COALESCE(qual, '') ILIKE '%meeting-reports%'
        OR COALESCE(with_check, '') ILIKE '%meeting-reports%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY receipts_objects_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'receipts');
CREATE POLICY receipts_objects_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN ('stores', 'central-kitchens')
    AND public.can_access_storage_store((storage.foldername(name))[2])
  );
CREATE POLICY receipts_objects_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN ('stores', 'central-kitchens')
    AND public.can_access_storage_store((storage.foldername(name))[2])
  ) WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN ('stores', 'central-kitchens')
    AND public.can_access_storage_store((storage.foldername(name))[2])
  );
CREATE POLICY receipts_objects_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN ('stores', 'central-kitchens')
    AND public.can_access_storage_store((storage.foldername(name))[2])
  );

CREATE POLICY meeting_report_objects_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'meeting-reports');
CREATE POLICY meeting_report_objects_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'meeting-reports'
    AND public.can_access_storage_store(
      CASE
        WHEN (storage.foldername(name))[1] = 'meeting-reports' THEN (storage.foldername(name))[2]
        ELSE (storage.foldername(name))[1]
      END
    )
  );
CREATE POLICY meeting_report_objects_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'meeting-reports'
    AND public.can_access_storage_store(
      CASE
        WHEN (storage.foldername(name))[1] = 'meeting-reports' THEN (storage.foldername(name))[2]
        ELSE (storage.foldername(name))[1]
      END
    )
  ) WITH CHECK (
    bucket_id = 'meeting-reports'
    AND public.can_access_storage_store(
      CASE
        WHEN (storage.foldername(name))[1] = 'meeting-reports' THEN (storage.foldername(name))[2]
        ELSE (storage.foldername(name))[1]
      END
    )
  );
CREATE POLICY meeting_report_objects_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'meeting-reports'
    AND public.can_access_storage_store(
      CASE
        WHEN (storage.foldername(name))[1] = 'meeting-reports' THEN (storage.foldername(name))[2]
        ELSE (storage.foldername(name))[1]
      END
    )
  );

COMMENT ON FUNCTION public.can_access_store_uuid(uuid) IS
  '目前登入者是否為 HQ 或被指派至指定店家；供 RLS policy 共用。';
