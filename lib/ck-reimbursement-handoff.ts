import 'server-only'

import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { CK_REIMBURSEMENT_AUTO_CONFIRM_MS } from '@/lib/ck-reimbursement-handoff-deadline'

export { getCKReimbursementAutoConfirmAt } from '@/lib/ck-reimbursement-handoff-deadline'

export function isCKReimbursementAutoConfirmed(input: {
  confirmed: boolean | null | undefined
  confirmedAt?: string | null
  confirmedBy?: string | null
}) {
  return Boolean(input.confirmed && input.confirmedAt && !input.confirmedBy)
}

/**
 * Completes HQ reimbursement handoffs whose 24-hour deadline has passed.
 *
 * This runs both from the scheduled endpoint and before relevant pages read the
 * records. The conditional update keeps the operation idempotent when a manual
 * confirmation and a scheduled run happen at the same time.
 */
export async function autoCompleteExpiredCKReimbursementHandoffs(options: {
  ckStoreId?: string
  now?: Date
} = {}) {
  const admin = createAdminClient()
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - CK_REIMBURSEMENT_AUTO_CONFIRM_MS).toISOString()
  const completedAt = now.toISOString()

  let query = admin
    .from('ck_daily_records')
    .update({
      ck_reimbursement_confirmed: true,
      ck_reimbursement_confirmed_at: completedAt,
      ck_reimbursement_confirmed_by: null,
      updated_at: completedAt,
    })
    .eq('hq_paid', true)
    .eq('ck_reimbursement_confirmed', false)
    .lte('hq_reimbursement_sent_at', cutoff)

  if (options.ckStoreId) query = query.eq('ck_store_id', options.ckStoreId)

  const { data, error } = await query.select('id, ck_store_id, business_date, hq_reimbursement_sent_at')
  if (error) throw new Error(`自動點交失敗：${error.message}`)

  const completed = data ?? []
  await Promise.all(completed.map(record => logAudit({
    eventType: 'ck_hq_paid',
    storeId: record.ck_store_id,
    description: `系統已自動完成央廚 ${record.business_date} 補款點交`,
    metadata: {
      business_date: record.business_date,
      handoff_confirmed: true,
      confirmation_method: 'automatic_24h',
      reimbursement_sent_at: record.hq_reimbursement_sent_at,
      confirmed_at: completedAt,
    },
  })))

  return { completedCount: completed.length, completed }
}
