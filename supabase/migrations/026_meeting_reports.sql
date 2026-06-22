-- ────────────────────────────────────────────────────────────
-- 雙週會議報告系統
-- 1. meeting_reports：每次會議一列
-- 2. meeting_action_items：本次提出的改善項目（可跨會議追蹤狀態）
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_reports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  meeting_date             date,

  -- 區塊 1：主要營運回顧（HTML，由系統自動產出後可編輯）
  operations_review_html   text,

  -- 區塊 2：客訴反應 / Google 評論
  customer_feedback_html   text,
  customer_feedback_photos jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 區塊 3：同仁狀況
  staff_status_html        text,
  staff_status_photos      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 區塊 4：產品品質
  product_quality_html     text,
  product_quality_photos   jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 其他備註區塊（彈性）
  notes_html               text,
  notes_photos             jsonb NOT NULL DEFAULT '[]'::jsonb,

  status                   text NOT NULL DEFAULT 'draft',  -- draft / submitted
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_reports_store ON meeting_reports(store_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reports_period ON meeting_reports(store_id, period_end DESC);

-- 行動項目（改善項目）：可關聯本次會議「新提出」，後續會議標記「已解決/未解決」
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  raised_in_report_id uuid NOT NULL REFERENCES meeting_reports(id) ON DELETE CASCADE,
  description         text NOT NULL,
  status              text NOT NULL DEFAULT 'open',     -- open / resolved / dropped
  resolution_note     text,                              -- 解決說明
  resolved_in_report_id uuid REFERENCES meeting_reports(id) ON DELETE SET NULL,
  resolved_at         date,
  order_index         int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_store ON meeting_action_items(store_id);
CREATE INDEX IF NOT EXISTS idx_action_items_raised ON meeting_action_items(raised_in_report_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON meeting_action_items(store_id, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meeting_reports_touch ON meeting_reports;
CREATE TRIGGER trg_meeting_reports_touch
  BEFORE UPDATE ON meeting_reports
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_action_items_touch ON meeting_action_items;
CREATE TRIGGER trg_action_items_touch
  BEFORE UPDATE ON meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS
ALTER TABLE meeting_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

-- 政策：登入用戶可讀寫自己店家的報告（簡化版，後續可細化）
DROP POLICY IF EXISTS meeting_reports_all ON meeting_reports;
CREATE POLICY meeting_reports_all ON meeting_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS action_items_all ON meeting_action_items;
CREATE POLICY action_items_all ON meeting_action_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 建立 storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-reports', 'meeting-reports', true)
ON CONFLICT (id) DO NOTHING;

-- storage 政策
DROP POLICY IF EXISTS meeting_reports_read ON storage.objects;
CREATE POLICY meeting_reports_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'meeting-reports');

DROP POLICY IF EXISTS meeting_reports_write ON storage.objects;
CREATE POLICY meeting_reports_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-reports');

DROP POLICY IF EXISTS meeting_reports_update ON storage.objects;
CREATE POLICY meeting_reports_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'meeting-reports');

DROP POLICY IF EXISTS meeting_reports_delete ON storage.objects;
CREATE POLICY meeting_reports_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'meeting-reports');

-- 重新整理 PostgREST schema 快取
NOTIFY pgrst, 'reload schema';
