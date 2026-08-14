-- 品項不可只用品名識別。同名品項必須由「店家 + 廠商分類 + mapping id」區分。

ALTER TABLE public.receipt_items
  ADD COLUMN IF NOT EXISTS item_mapping_id uuid REFERENCES public.item_column_mappings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_group_snapshot text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_mapping_id uuid REFERENCES public.item_column_mappings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_group_snapshot text;

CREATE INDEX IF NOT EXISTS idx_receipt_items_mapping_id
  ON public.receipt_items(item_mapping_id);
CREATE INDEX IF NOT EXISTS idx_order_items_mapping_id
  ON public.order_items(item_mapping_id);

-- 一般單據：只在「同店 + 同分類 + 同品名」完全吻合時回填 mapping。
UPDATE public.receipt_items ri
SET
  item_mapping_id = m.id,
  vendor_group_snapshot = m.vendor_group,
  item_name = m.item_name,
  item_category = m.item_category,
  excel_column = m.excel_column
FROM public.receipts r
JOIN public.item_column_mappings m
  ON m.store_id = r.store_id
 AND m.vendor_group = r.vendor_name
WHERE ri.receipt_id = r.id
  AND ri.item_mapping_id IS NULL
  AND regexp_replace(lower(m.item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
      = regexp_replace(lower(ri.item_name), '[[:space:]　()（）\-－—–_]', '', 'g');

-- 央廚叫貨：來源本身就是央廚配送，絕不可依同名品項落到其他廠商。
UPDATE public.order_items
SET vendor = '央廚', vendor_group_snapshot = '央廚配送';

UPDATE public.order_items oi
SET
  item_mapping_id = m.id,
  item_name = m.item_name,
  excel_column = m.excel_column,
  vendor_group_snapshot = '央廚配送'
FROM public.daily_closings dc
JOIN public.item_column_mappings m
  ON m.store_id = dc.store_id
 AND m.vendor_group = '央廚配送'
WHERE oi.closing_id = dc.id
  AND oi.item_mapping_id IS NULL
  AND (
    regexp_replace(lower(m.item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
      = regexp_replace(lower(oi.item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
    OR (
      regexp_replace(lower(m.item_name), '[[:space:]　()（）\-－—–_]', '', 'g') IN ('油蔥', '油蔥酥')
      AND regexp_replace(lower(oi.item_name), '[[:space:]　()（）\-－—–_]', '', 'g') IN ('油蔥', '油蔥酥')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_receipt_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_receipt_vendor text;
  v_mapping public.item_column_mappings%ROWTYPE;
BEGIN
  SELECT r.store_id, r.vendor_name
  INTO v_store_id, v_receipt_vendor
  FROM public.receipts r
  WHERE r.id = NEW.receipt_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION '找不到收據所屬店家';
  END IF;

  IF NEW.item_mapping_id IS NOT NULL THEN
    SELECT * INTO v_mapping
    FROM public.item_column_mappings
    WHERE id = NEW.item_mapping_id AND store_id = v_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '品項對應不屬於這間店';
    END IF;
  ELSE
    SELECT * INTO v_mapping
    FROM public.item_column_mappings
    WHERE store_id = v_store_id
      AND vendor_group = COALESCE(NULLIF(NEW.vendor_group_snapshot, ''), v_receipt_vendor)
      AND regexp_replace(lower(item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
          = regexp_replace(lower(NEW.item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
    ORDER BY id
    LIMIT 1;
  END IF;

  IF v_mapping.id IS NOT NULL THEN
    NEW.item_mapping_id := v_mapping.id;
    NEW.vendor_group_snapshot := v_mapping.vendor_group;
    NEW.item_name := v_mapping.item_name;
    NEW.item_category := v_mapping.item_category;
    NEW.excel_column := v_mapping.excel_column;
  ELSE
    NEW.vendor_group_snapshot := COALESCE(NULLIF(NEW.vendor_group_snapshot, ''), v_receipt_vendor, '未分類');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_receipt_item_identity ON public.receipt_items;
CREATE TRIGGER trg_enforce_receipt_item_identity
BEFORE INSERT OR UPDATE OF item_mapping_id, item_name, vendor_group_snapshot, receipt_id
ON public.receipt_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_item_identity();

CREATE OR REPLACE FUNCTION public.enforce_order_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_mapping public.item_column_mappings%ROWTYPE;
BEGIN
  SELECT dc.store_id INTO v_store_id
  FROM public.daily_closings dc
  WHERE dc.id = NEW.closing_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION '找不到叫貨明細所屬店家';
  END IF;

  IF NEW.item_mapping_id IS NOT NULL THEN
    SELECT * INTO v_mapping
    FROM public.item_column_mappings
    WHERE id = NEW.item_mapping_id
      AND store_id = v_store_id
      AND vendor_group = '央廚配送';
    IF NOT FOUND THEN
      RAISE EXCEPTION '央廚叫貨不可對應到其他廠商分類';
    END IF;
  ELSE
    SELECT * INTO v_mapping
    FROM public.item_column_mappings
    WHERE store_id = v_store_id
      AND vendor_group = '央廚配送'
      AND (
        regexp_replace(lower(item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
          = regexp_replace(lower(NEW.item_name), '[[:space:]　()（）\-－—–_]', '', 'g')
        OR (
          regexp_replace(lower(item_name), '[[:space:]　()（）\-－—–_]', '', 'g') IN ('油蔥', '油蔥酥')
          AND regexp_replace(lower(NEW.item_name), '[[:space:]　()（）\-－—–_]', '', 'g') IN ('油蔥', '油蔥酥')
        )
      )
    ORDER BY id
    LIMIT 1;
  END IF;

  NEW.vendor := '央廚';
  NEW.vendor_group_snapshot := '央廚配送';
  IF v_mapping.id IS NOT NULL THEN
    NEW.item_mapping_id := v_mapping.id;
    NEW.item_name := v_mapping.item_name;
    NEW.excel_column := v_mapping.excel_column;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_identity ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_identity
BEFORE INSERT OR UPDATE OF item_mapping_id, item_name, vendor_group_snapshot, vendor, closing_id
ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_identity();

COMMENT ON COLUMN public.receipt_items.item_mapping_id IS '不可變的品項對應識別碼；同名品項以此區分';
COMMENT ON COLUMN public.receipt_items.vendor_group_snapshot IS '建立帳目當下的廠商分類快照';
COMMENT ON COLUMN public.order_items.item_mapping_id IS '央廚叫貨對應的店家品項 mapping id';
COMMENT ON COLUMN public.order_items.vendor_group_snapshot IS '央廚來源分類快照，固定為央廚配送';
