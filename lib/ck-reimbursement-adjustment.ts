import { createAdminClient } from '@/lib/supabase/admin'

export interface CKReimbursementAdjustment {
  amount: number
  note: string
}

function normalizeAdjustment(metadata: unknown): CKReimbursementAdjustment | null {
  if (!metadata || typeof metadata !== 'object') return null
  const row = metadata as Record<string, unknown>
  if (typeof row.reimbursement_adjustment !== 'number' || !Number.isFinite(row.reimbursement_adjustment)) return null
  return {
    amount: Math.round(row.reimbursement_adjustment),
    note: typeof row.reimbursement_adjustment_note === 'string' ? row.reimbursement_adjustment_note : '',
  }
}

/**
 * 補款調整使用 audit_logs 保存，讓每一次加減都有歷程，且不依賴新欄位 migration。
 * 同店同日以最新一筆含 reimbursement_adjustment 的 ck_hq_paid 紀錄為準。
 */
export async function getCKReimbursementAdjustments(
  ckStoreIds: string[],
  date: string,
): Promise<Record<string, CKReimbursementAdjustment>> {
  if (ckStoreIds.length === 0) return {}
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('audit_logs')
    .select('store_id, metadata, created_at')
    .eq('event_type', 'ck_hq_paid')
    .in('store_id', ckStoreIds)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) {
    console.error('[getCKReimbursementAdjustments]', error.message)
    return {}
  }

  const result: Record<string, CKReimbursementAdjustment> = {}
  for (const row of data ?? []) {
    const storeId = row.store_id as string | null
    const metadata = row.metadata as Record<string, unknown> | null
    if (!storeId || result[storeId] || metadata?.business_date !== date) continue
    const adjustment = normalizeAdjustment(metadata)
    if (adjustment) result[storeId] = adjustment
  }
  return result
}

export async function recordCKReimbursementAdjustment(input: {
  ckStoreId: string
  date: string
  userId: string
  userName?: string | null
  userEmail?: string | null
  amount: number
  note?: string
}) {
  const admin = createAdminClient()
  const amount = Math.round(input.amount)
  const note = input.note?.trim().slice(0, 200) ?? ''
  const sign = amount > 0 ? '+' : ''
  return admin.from('audit_logs').insert({
    event_type: 'ck_hq_paid',
    severity: 'info',
    store_id: input.ckStoreId,
    user_id: input.userId,
    description: `${input.userName ?? input.userEmail ?? '未知'} 調整央廚 ${input.date} 補款 ${sign}$${amount.toLocaleString('zh-TW')}${note ? `（${note}）` : ''}`,
    metadata: {
      action: 'reimbursement_adjustment',
      business_date: input.date,
      reimbursement_adjustment: amount,
      reimbursement_adjustment_note: note,
    },
  })
}
