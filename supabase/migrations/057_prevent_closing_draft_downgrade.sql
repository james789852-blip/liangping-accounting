-- 防止延遲的店長端 autosave 將已送出／已核准帳目降回草稿。
-- 狀態轉換應由 submitClosing、disputeClosing、verifyClosing 等 server action 負責。

-- 修復導入此防護前唯一一筆「已有成功送出紀錄，但狀態被寫回草稿」的資料。
UPDATE daily_closings AS closing
SET status = 'submitted'
WHERE closing.status = 'draft'
  AND closing.submitted_at IS NOT NULL
  AND closing.submitted_by IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM audit_logs AS audit
    WHERE audit.closing_id = closing.id
      AND audit.event_type = 'closing_submit'
  );

CREATE OR REPLACE FUNCTION prevent_daily_closing_draft_downgrade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('submitted', 'verified') AND NEW.status = 'draft' THEN
    RAISE EXCEPTION '已送出或已核准的帳目不能改回草稿'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_daily_closing_draft_downgrade ON daily_closings;

CREATE TRIGGER trg_prevent_daily_closing_draft_downgrade
BEFORE UPDATE OF status ON daily_closings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION prevent_daily_closing_draft_downgrade();

COMMENT ON FUNCTION prevent_daily_closing_draft_downgrade() IS
  '阻止延遲 autosave 將 submitted/verified 帳目降回 draft；正式退回 disputed 仍允許。';
