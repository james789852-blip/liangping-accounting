-- 032: 稅務模式 + 單據類型擴展
--
-- 設計理念（依各店現用 Excel 明細還原）：
--   - 食材 vendor_group → doc_type 可能是「公司開」或「其他店開」
--   - 耗材 vendor_group → doc_type 可能是「發票 / 收據 / 估價單 / 公司開」
--   - 廠商分類本身有 tax_mode：'inclusive'（含稅可申退）/ 'free'（免稅）
--   - 退稅金額由系統依 tax_mode 自動算（金額 ÷ 21），不再用「XX稅金」品項手動填
--   - 個別品項可用 doc_type_override 覆寫該分類預設的 doc_type
--     例：某菜商品項是「梁鑫店開」、其他多數是「公司開」

-- 1. 廠商分類加稅務模式
ALTER TABLE system_vendor_groups
  ADD COLUMN IF NOT EXISTS tax_mode TEXT
    CHECK (tax_mode IN ('inclusive', 'free'))
    DEFAULT 'inclusive';

COMMENT ON COLUMN system_vendor_groups.tax_mode IS
  'inclusive=含稅可申退（依金額÷21算）; free=免稅（收據/估價單通常）';

-- 預設：收據、估價單 → 免稅；其他（發票、公司開）→ 含稅可退
UPDATE system_vendor_groups SET tax_mode = 'free'
WHERE doc_type IN ('收據', '估價單')
  AND tax_mode = 'inclusive';

-- 2. 系統品項可覆寫單據類型（讓單一品項屬於不同 doc_type，例如某品項是「其他店開」）
ALTER TABLE system_items
  ADD COLUMN IF NOT EXISTS doc_type_override TEXT;

COMMENT ON COLUMN system_items.doc_type_override IS
  '若該品項使用的單據類型與所屬 vendor_group 預設不同，可覆寫（如：菜商分類下某品項是「其他店開」）';

ALTER TABLE store_items
  ADD COLUMN IF NOT EXISTS doc_type_override TEXT;

COMMENT ON COLUMN store_items.doc_type_override IS
  '店家層級覆寫該品項的單據類型，優先於 system_items.doc_type_override';

-- 注意：doc_type 是純字串，新增「其他店開」這個值不需要 ALTER（前端 select option 加即可）
