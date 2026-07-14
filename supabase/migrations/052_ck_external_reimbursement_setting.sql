-- Allow each central-kitchen external customer to control whether its revenue
-- is deducted from the amount packed for HQ reimbursement.
ALTER TABLE ck_external_stores
  ADD COLUMN IF NOT EXISTS deduct_from_reimbursement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ck_external_stores.deduct_from_reimbursement IS
  'Whether this external customer revenue is deducted from the central-kitchen reimbursement amount';

-- Preserve the existing business rule for the known Quanzhou customer.
UPDATE ck_external_stores ext
SET deduct_from_reimbursement = true
FROM stores ck
WHERE ck.id = ext.ck_store_id
  AND btrim(ck.name) LIKE '泉州%'
  AND btrim(ext.name) = '食咣雞';

NOTIFY pgrst, 'reload schema';
