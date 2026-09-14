import 'server-only'

import { logAudit } from '@/lib/audit'
import { getBusinessDate } from '@/lib/business-date'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldTrackStoreAccountingDate } from '@/lib/overdue-accounting'
import {
  notifyCKUsersOfReimbursementHandoff,
  notifyStoreUsersOfAccountingReminder,
} from '@/lib/push-notifications'

type AccountingReminderStage = '23:00' | '23:30'

type ReminderResult = {
  eligible: number
  skippedAsAlreadySent: number
  targetDevices: number
  delivered: number
}

function reminderKey(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join('|')
}

async function sentReminderKeys(stage: string, businessDate?: string) {
  const admin = createAdminClient()
  let query = admin
    .from('audit_logs')
    .select('metadata')
    .eq('event_type', 'push_reminder')
    .contains('metadata', { reminder_stage: stage })
  if (businessDate) query = query.contains('metadata', { business_date: businessDate })
  else query = query.gte('created_at', new Date(Date.now() - 2 * 86400000).toISOString())
  const { data, error } = await query
  if (error) throw new Error(`讀取推播提醒紀錄失敗：${error.message}`)
  return new Set((data ?? []).map(row => String((row.metadata as Record<string, unknown> | null)?.reminder_key ?? '')).filter(Boolean))
}

/** Remind active stores/central kitchens whose current business-day record is not submitted. */
export async function sendAccountingSubmissionReminders(
  stage: AccountingReminderStage,
  businessDate = getBusinessDate(),
): Promise<ReminderResult> {
  const admin = createAdminClient()
  const [{ data: stores, error: storeError }, { data: closings, error: closingError }, { data: ckRecords, error: ckError }, { data: holidays, error: holidayError }] = await Promise.all([
    admin.from('stores').select('id, name, type, created_at').eq('active', true),
    admin.from('daily_closings').select('store_id, status').eq('business_date', businessDate),
    admin.from('ck_daily_records').select('id, ck_store_id, status').eq('business_date', businessDate),
    admin.from('store_holidays').select('store_id').eq('holiday_date', businessDate),
  ])
  const loadError = storeError || closingError || ckError || holidayError
  if (loadError) throw new Error(`讀取未送出帳目失敗：${loadError.message}`)

  const holidayStoreIds = new Set((holidays ?? []).map(row => String(row.store_id)))
  const storeStatus = new Map((closings ?? []).map(row => [String(row.store_id), String(row.status)]))
  const ckStatus = new Map((ckRecords ?? []).map(row => [String(row.ck_store_id), String(row.status)]))
  const alreadySent = await sentReminderKeys(`accounting-${stage}`, businessDate)
  const pending = (stores ?? []).flatMap(store => {
    const id = String(store.id)
    if (holidayStoreIds.has(id) || !shouldTrackStoreAccountingDate(businessDate, store.created_at)) return []
    const kind = store.type === '央廚' ? 'ck' as const : 'store' as const
    const status = kind === 'ck' ? ckStatus.get(id) : storeStatus.get(id)
    if (status === 'submitted' || status === 'verified') return []
    return [{ id, name: String(store.name), kind, status: status ?? null }]
  })

  let skippedAsAlreadySent = 0
  let targetDevices = 0
  let delivered = 0
  for (const store of pending) {
    const key = reminderKey(['accounting', store.kind, stage, store.id, businessDate])
    if (alreadySent.has(key)) {
      skippedAsAlreadySent += 1
      continue
    }
    const result = await notifyStoreUsersOfAccountingReminder({
      kind: store.kind,
      storeId: store.id,
      businessDate,
      stage,
      status: store.status,
    })
    targetDevices += result.total
    delivered += result.delivered
    await logAudit({
      eventType: 'push_reminder',
      severity: 'warn',
      storeId: store.id,
      description: `系統於 ${stage} 提醒${store.kind === 'ck' ? '央廚' : '店面'}「${store.name}」送出 ${businessDate} 帳目`,
      metadata: {
        reminder_key: key,
        reminder_stage: `accounting-${stage}`,
        business_date: businessDate,
        accounting_kind: store.kind,
        current_status: store.status,
        target_devices: result.total,
        delivered_devices: result.delivered,
      },
    })
  }

  return { eligible: pending.length, skippedAsAlreadySent, targetDevices, delivered }
}

/** Remind each still-pending reimbursement once at the next 17:00 run. */
export async function sendCKReimbursementHandoffReminders(): Promise<ReminderResult> {
  const admin = createAdminClient()
  const [{ data: records, error }, { data: activeCKStores, error: storeError }] = await Promise.all([
    admin
      .from('ck_daily_records')
      .select('id, ck_store_id, business_date, hq_reimbursement_sent_at')
      .eq('hq_paid', true)
      .eq('ck_reimbursement_confirmed', false)
      .not('hq_reimbursement_sent_at', 'is', null),
    admin.from('stores').select('id').eq('type', '央廚').eq('active', true),
  ])
  if (error || storeError) throw new Error(`讀取待點交補款失敗：${(error || storeError)!.message}`)

  const stage = 'ck-handoff-17:00'
  const alreadySent = await sentReminderKeys(stage)
  const activeCKStoreIds = new Set((activeCKStores ?? []).map(store => String(store.id)))
  const pending = (records ?? []).filter(record => activeCKStoreIds.has(String(record.ck_store_id)))
  let skippedAsAlreadySent = 0
  let targetDevices = 0
  let delivered = 0
  for (const record of pending) {
    const key = reminderKey([
      'ck-handoff', '17:00', String(record.id),
      String(record.hq_reimbursement_sent_at),
    ])
    if (alreadySent.has(key)) {
      skippedAsAlreadySent += 1
      continue
    }
    const result = await notifyCKUsersOfReimbursementHandoff({
      storeId: String(record.ck_store_id),
      businessDate: String(record.business_date),
      recordId: String(record.id),
      stage: '17:00',
    })
    targetDevices += result.total
    delivered += result.delivered
    await logAudit({
      eventType: 'push_reminder',
      severity: 'warn',
      storeId: String(record.ck_store_id),
      description: `系統於 17:00 提醒央廚完成 ${record.business_date} 補款點交`,
      metadata: {
        reminder_key: key,
        reminder_stage: stage,
        business_date: record.business_date,
        ck_daily_record_id: record.id,
        reimbursement_sent_at: record.hq_reimbursement_sent_at,
        target_devices: result.total,
        delivered_devices: result.delivered,
      },
    })
  }

  return { eligible: pending.length, skippedAsAlreadySent, targetDevices, delivered }
}
