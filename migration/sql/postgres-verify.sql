-- 梁平帳務 Supabase -> Firebase/Cloud SQL 核對腳本
--
-- 在來源與目標 PostgreSQL 各執行一次，輸出必須逐項相同。
-- 此腳本只讀正式資料；唯一建立的是連線結束即消失的 TEMP TABLE。

BEGIN TRANSACTION READ ONLY;

CREATE TEMP TABLE migration_table_verification (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  content_checksum text NOT NULL
);

DO $$
DECLARE
  current_table text;
  current_count bigint;
  current_checksum text;
BEGIN
  FOR current_table IN
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'SELECT count(*), md5(COALESCE(string_agg(row_hash, '''' ORDER BY row_hash), ''''))
         FROM (
           SELECT md5(to_jsonb(source_row)::text) AS row_hash
           FROM public.%I AS source_row
         ) AS hashed_rows',
      current_table
    ) INTO current_count, current_checksum;

    INSERT INTO migration_table_verification(table_name, row_count, content_checksum)
    VALUES (current_table, current_count, current_checksum);
  END LOOP;
END $$;

-- 第一關：所有資料表筆數及完整內容 checksum 必須相同。
SELECT table_name, row_count, content_checksum
FROM migration_table_verification
ORDER BY table_name;

-- 第二關：每日、每店的財務欄位必須相同，不能只比較總筆數。
SELECT
  store_id,
  business_date,
  status,
  count(*) AS closing_count,
  sum(total_revenue) AS total_revenue,
  sum(total_cost) AS total_cost,
  sum(total_expenses) AS total_expenses,
  sum(expected_remit) AS expected_remit,
  sum(actual_remit) AS actual_remit,
  sum(variance) AS variance
FROM public.daily_closings
GROUP BY store_id, business_date, status
ORDER BY business_date, store_id, status;

-- 第三關：央廚的店面輸入、央廚確認、支出與狀態必須相同。
WITH order_totals AS (
  SELECT
    ck_daily_record_id,
    count(*) AS order_count,
    sum(amount) AS store_reported_amount,
    sum(ck_confirmed_amount) AS ck_confirmed_amount
  FROM public.ck_store_orders
  GROUP BY ck_daily_record_id
),
expense_totals AS (
  SELECT
    ck_daily_record_id,
    count(*) AS expense_count,
    sum(amount) AS expense_amount
  FROM public.ck_expense_items
  GROUP BY ck_daily_record_id
)
SELECT
  records.ck_store_id,
  records.business_date,
  records.status,
  coalesce(orders.order_count, 0) AS order_count,
  coalesce(orders.store_reported_amount, 0) AS store_reported_amount,
  coalesce(orders.ck_confirmed_amount, 0) AS ck_confirmed_amount,
  coalesce(expenses.expense_count, 0) AS expense_count,
  coalesce(expenses.expense_amount, 0) AS expense_amount,
  records.hq_paid,
  records.ck_reimbursement_confirmed
FROM public.ck_daily_records AS records
LEFT JOIN order_totals AS orders ON orders.ck_daily_record_id = records.id
LEFT JOIN expense_totals AS expenses ON expenses.ck_daily_record_id = records.id
ORDER BY records.business_date, records.ck_store_id;

-- 第四關：每種結帳狀態數量必須相同，避免已送出資料被降回草稿。
SELECT 'daily_closings' AS source, status, count(*) AS row_count
FROM public.daily_closings
GROUP BY status
UNION ALL
SELECT 'ck_daily_records' AS source, status, count(*) AS row_count
FROM public.ck_daily_records
GROUP BY status
ORDER BY source, status;

COMMIT;

