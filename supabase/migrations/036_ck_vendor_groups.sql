-- 央廚每日 expense 廠商群組（每個央廚一份）
-- 用於：央廚每日輸入 expense 時的廠商 datalist；HQ 集中管理

CREATE TABLE IF NOT EXISTS ck_vendor_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ck_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text,                -- 預設單據類型（可空）— 例：「發票」「收據」
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ck_store_id, name)
);

CREATE INDEX IF NOT EXISTS ck_vendor_groups_store_idx ON ck_vendor_groups (ck_store_id);

COMMENT ON TABLE ck_vendor_groups IS '央廚常用廠商群組清單，每個央廚一份';
COMMENT ON COLUMN ck_vendor_groups.name IS '廠商群組名稱（例：雞肉商 / 菜商 / 雜貨 / 翁師傅）';
COMMENT ON COLUMN ck_vendor_groups.doc_type IS '該廠商預設單據類型';
