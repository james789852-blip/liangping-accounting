-- 完整鎖定已送出／已審核帳目，避免舊分頁或延遲 autosave 覆寫內容與子明細。
-- 正式的送出、退回、審核流程使用 service_role server action，仍可進行授權狀態轉換。

CREATE OR REPLACE FUNCTION prevent_locked_daily_closing_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND OLD.status IN ('submitted', 'verified') THEN
    RAISE EXCEPTION '已送出或已審核的帳目不能由店長端修改，請重新整理頁面'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_daily_closing_mutation ON daily_closings;

CREATE TRIGGER trg_prevent_locked_daily_closing_mutation
BEFORE UPDATE ON daily_closings
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_daily_closing_mutation();

CREATE OR REPLACE FUNCTION prevent_locked_closing_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_closing_id uuid;
BEGIN
  target_closing_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.closing_id
    ELSE NEW.closing_id
  END;

  IF auth.role() <> 'service_role' AND EXISTS (
    SELECT 1
    FROM daily_closings
    WHERE id = target_closing_id
      AND status IN ('submitted', 'verified')
  ) THEN
    RAISE EXCEPTION '已送出或已審核的帳目明細不能由店長端修改，請重新整理頁面'
      USING ERRCODE = '23514';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE
  child_table text;
BEGIN
  FOREACH child_table IN ARRAY ARRAY[
    'revenue_items',
    'order_items',
    'expense_items',
    'cash_counts',
    'handwrite_orders',
    'receipts',
    'platform_screenshots'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_prevent_locked_closing_child_mutation', child_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_locked_closing_child_mutation()',
      'trg_prevent_locked_closing_child_mutation',
      child_table
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION prevent_locked_daily_closing_mutation() IS
  '阻止 authenticated 舊分頁修改 submitted/verified daily_closings；service_role 審核流程不受影響。';

COMMENT ON FUNCTION prevent_locked_closing_child_mutation() IS
  '阻止 authenticated 舊分頁修改已送出／已審核帳目的營收、叫貨、支出、現金、收據與照片明細。';
