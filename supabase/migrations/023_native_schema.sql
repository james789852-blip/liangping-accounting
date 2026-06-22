-- 結帳系統原生化重寫 - schema
-- 目標：取代「店家上傳 Excel 模板」流程，把全部欄位與計算規則放在系統內

-- ────────────────────────────────────────────────────────────
-- 1. system_vendor_groups（廠商/分類主表）
-- 全公司共用的分類：央廚配送、菜商、雜貨、免洗、Duskin、翁師傅、退稅、發票、收據、估價單、未分類
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_vendor_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  kind        text NOT NULL CHECK (kind IN ('vendor', 'doc_type', 'tax', 'ck', 'uncategorized')),
  sort_order  int NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true,
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. system_items（全公司品項主表）
-- 內建品項，店家可以「啟用 / 不啟用」
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  category        text NOT NULL CHECK (category IN ('食材', '耗材', '雜項')),
  vendor_group_id uuid REFERENCES system_vendor_groups(id) ON DELETE SET NULL,
  default_enabled boolean NOT NULL DEFAULT false,  -- 預設是否所有店都啟用
  sort_order      int NOT NULL DEFAULT 100,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(name, vendor_group_id)
);

CREATE INDEX IF NOT EXISTS idx_system_items_vg ON system_items(vendor_group_id);
CREATE INDEX IF NOT EXISTS idx_system_items_cat ON system_items(category);

-- ────────────────────────────────────────────────────────────
-- 3. store_items（店家品項使用設定）
-- 店家從 system_items 勾選啟用，或新增自己獨有的品項
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  system_item_id  uuid REFERENCES system_items(id) ON DELETE CASCADE,  -- null 表示店家自訂
  -- 店家自訂品項時用以下欄位（不參考 system_items）
  custom_name     text,
  custom_category text CHECK (custom_category IN ('食材', '耗材', '雜項') OR custom_category IS NULL),
  custom_vendor_group_id uuid REFERENCES system_vendor_groups(id) ON DELETE SET NULL,
  sort_order      int NOT NULL DEFAULT 100,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CHECK (
    (system_item_id IS NOT NULL AND custom_name IS NULL) OR
    (system_item_id IS NULL AND custom_name IS NOT NULL AND custom_category IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_store_items_store ON store_items(store_id);
CREATE INDEX IF NOT EXISTS idx_store_items_sys ON store_items(system_item_id);
-- 避免店家重複啟用同一個系統品項
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_items_unique_sys
  ON store_items(store_id, system_item_id) WHERE system_item_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. store_revenue_settings（店家通路設定，取代散落在 stores 的 flag）
-- ────────────────────────────────────────────────────────────
-- 目前 stores 上的 online_enabled、online_cash_enabled、panda_enabled、
-- twpay_enabled 等已存在，這次新增「NFT」flag
ALTER TABLE stores ADD COLUMN IF NOT EXISTS nft_enabled boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- 5. closing_template_version（每店家紀錄使用哪個版型）
-- ────────────────────────────────────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS closing_layout text NOT NULL DEFAULT 'auto'
  CHECK (closing_layout IN ('auto', 'handwrite', 'ichef'));
-- auto: 依 mode 自動選；handwrite: A 型；ichef: B 型
