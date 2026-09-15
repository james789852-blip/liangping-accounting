-- Runtime performance indexes for current production hot paths.
-- Existing store-closing indexes are intentionally not duplicated.

-- Production is missing these receipt indexes even though an older migration
-- declared the first one. HQ review/report screens use both relationships heavily.
CREATE INDEX IF NOT EXISTS idx_receipts_store_date
  ON public.receipts (store_id, business_date);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt
  ON public.receipt_items (receipt_id);

-- Central-kitchen lists and aggregates filter by date/status. The existing unique
-- index on (ck_store_id, business_date) already covers kitchen/date lookups.
CREATE INDEX IF NOT EXISTS idx_ck_daily_records_date_status
  ON public.ck_daily_records (business_date DESC, status);

-- Scheduled reminders only inspect returned records and unconfirmed handoffs.
CREATE INDEX IF NOT EXISTS idx_daily_closings_disputed_updated
  ON public.daily_closings (updated_at)
  WHERE status = 'disputed';

CREATE INDEX IF NOT EXISTS idx_ck_daily_records_disputed_updated
  ON public.ck_daily_records (updated_at)
  WHERE status = 'disputed';

CREATE INDEX IF NOT EXISTS idx_ck_daily_records_handoff_pending
  ON public.ck_daily_records (hq_reimbursement_sent_at)
  WHERE hq_paid = true
    AND ck_reimbursement_confirmed = false
    AND hq_reimbursement_sent_at IS NOT NULL;

-- ck_store_orders already has a unique index beginning with ck_daily_record_id.
CREATE INDEX IF NOT EXISTS idx_ck_expense_items_daily_record_sort
  ON public.ck_expense_items (ck_daily_record_id, sort_order);

-- Audit screens and notification de-duplication search these fields repeatedly.
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created
  ON public.audit_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_closing_created
  ON public.audit_logs (closing_id, created_at)
  WHERE closing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin
  ON public.audit_logs USING gin (metadata jsonb_path_ops);

-- Permissions and push targeting frequently use store_ids @> ARRAY[store_id].
CREATE INDEX IF NOT EXISTS idx_user_profiles_store_ids_gin
  ON public.user_profiles USING gin (store_ids);

NOTIFY pgrst, 'reload schema';
