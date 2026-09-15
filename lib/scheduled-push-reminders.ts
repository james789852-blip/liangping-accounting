import 'server-only'

import { logAudit } from '@/lib/audit'
import { getBusinessDate } from '@/lib/business-date'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldTrackStoreAccountingDate } from '@/lib/overdue-accounting'
import {
  notifyCKUsersOfReimbursementHandoff,
  notifyReviewersOfEscalation,
  notifyStoreUsersOfReturnedReminder,
  notifyStoreUsersOfAccountingReminder,
} from '@/lib/push-notifications'
import { formatReminderDelay } from '@/lib/push-schedule'

type AccountingReminderStage = 'first' | 'final'

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
  const { data, error } = await query
  if (error) throw new Error(`讀取推播提醒紀錄失敗：${error.message}`)
  return new Set((data ?? []).map(row => String((row.metadata as Record<string, unknown> | null)?.reminder_key ?? '')).filter(Boolean))
}

/** Remind active stores/central kitchens whose current business-day record is not submitted. */
export async function sendAccountingSubmissionReminders(
  stage: AccountingReminderStage,
  scheduledTime: string,
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
      description: `系統於 ${scheduledTime} 提醒${store.kind === 'ck' ? '央廚' : '店面'}「${store.name}」送出 ${businessDate} 帳目`,
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

  if (stage === 'final' && pending.length > 0) {
    const storeNames = pending.slice(0, 5).map(store => store.name).join('、')
    const more = pending.length > 5 ? `等 ${pending.length} 間` : ''
    const escalation = await notifyReviewersOfEscalation({
      title: `${scheduledTime} 仍有帳目未送出`,
      body: `${storeNames}${more}尚未送出帳目，請追蹤處理。`,
      url: '/hq/accounting',
      sourceKey: `hq-accounting-final-${businessDate}`,
      storeId: pending.length === 1 ? pending[0].id : undefined,
    })
    targetDevices += escalation.total
    delivered += escalation.delivered
  }

  return { eligible: pending.length, skippedAsAlreadySent, targetDevices, delivered }
}

/** Remind each still-pending reimbursement once at the configured Taiwan-time run. */
export async function sendCKReimbursementHandoffReminders(scheduledTime: string): Promise<ReminderResult> {
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

  const stage = 'ck-handoff-reminder'
  const alreadySent = await sentReminderKeys(stage)
  const activeCKStoreIds = new Set((activeCKStores ?? []).map(store => String(store.id)))
  const pending = (records ?? []).filter(record => activeCKStoreIds.has(String(record.ck_store_id)))
  let skippedAsAlreadySent = 0
  let targetDevices = 0
  let delivered = 0
  for (const record of pending) {
    const key = reminderKey([
      'ck-handoff', 'reminder', String(record.id),
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
      stage: 'reminder',
    })
    targetDevices += result.total
    delivered += result.delivered
    await logAudit({
      eventType: 'push_reminder',
      severity: 'warn',
      storeId: String(record.ck_store_id),
      description: `系統於 ${scheduledTime} 提醒央廚完成 ${record.business_date} 補款點交`,
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

  if (pending.length > 0) {
    const escalation = await notifyReviewersOfEscalation({
      title: '央廚補款仍未點交',
      body: `目前有 ${pending.length} 筆央廚補款在 ${scheduledTime} 後仍未點交，請追蹤處理。`,
      url: '/hq/accounting?tab=ck',
      sourceKey: `hq-ck-handoff-${pending.map(record => `${record.id}:${record.hq_reimbursement_sent_at}`).sort().join(',')}`,
      storeId: pending.length === 1 ? String(pending[0].ck_store_id) : undefined,
    })
    targetDevices += escalation.total
    delivered += escalation.delivered
  }

  return { eligible: pending.length, skippedAsAlreadySent, targetDevices, delivered }
}

/** Remind store users and HQ when a returned record remains unresolved past the configured delay. */
export async function sendReturnedAccountingReminders(delayMinutes: number): Promise<ReminderResult> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - delayMinutes * 60000).toISOString()
  const delayLabel = formatReminderDelay(delayMinutes)
  const [{ data: stores, error: storeError }, { data: closings, error: closingError }, { data: ckRecords, error: ckError }] = await Promise.all([
    admin.from('stores').select('id, name, type').eq('active', true),
    admin.from('daily_closings').select('id, store_id, business_date, updated_at').eq('status', 'disputed').lte('updated_at', cutoff),
    admin.from('ck_daily_records').select('id, ck_store_id, business_date, updated_at').eq('status', 'disputed').lte('updated_at', cutoff),
  ])
  const loadError = storeError || closingError || ckError
  if (loadError) throw new Error(`讀取退回待修改帳目失敗：${loadError.message}`)
  const activeStores = new Map((stores ?? []).map(store => [String(store.id), String(store.name)]))
  const pending = [
    ...(closings ?? []).map(record => ({
      id: String(record.id), storeId: String(record.store_id), businessDate: String(record.business_date),
      disputedAt: String(record.updated_at), kind: 'store' as const,
    })),
    ...(ckRecords ?? []).map(record => ({
      id: String(record.id), storeId: String(record.ck_store_id), businessDate: String(record.business_date),
      disputedAt: String(record.updated_at), kind: 'ck' as const,
    })),
  ].filter(record => activeStores.has(record.storeId))
  const stage = 'returned-reminder'
  const [currentReminderKeys, legacyReminderKeys] = await Promise.all([
    sentReminderKeys(stage),
    sentReminderKeys('returned-60m'),
  ])
  const alreadySent = new Set([...currentReminderKeys, ...legacyReminderKeys])
  let skippedAsAlreadySent = 0
  let targetDevices = 0
  let delivered = 0
  const escalated: typeof pending = []

  for (const record of pending) {
    const key = reminderKey(['returned', record.kind, record.id, record.disputedAt])
    if (alreadySent.has(key)) {
      skippedAsAlreadySent += 1
      continue
    }
    const result = await notifyStoreUsersOfReturnedReminder({
      kind: record.kind,
      storeId: record.storeId,
      businessDate: record.businessDate,
      recordId: record.id,
      disputedAt: record.disputedAt,
      delayMinutes,
    })
    targetDevices += result.total
    delivered += result.delivered
    escalated.push(record)
    await logAudit({
      eventType: 'push_reminder',
      severity: 'warn',
      storeId: record.storeId,
      description: `系統提醒「${activeStores.get(record.storeId)}」修改退回超過 ${delayLabel} 的 ${record.businessDate} 帳目`,
      metadata: {
        reminder_key: key,
        reminder_stage: stage,
        business_date: record.businessDate,
        accounting_kind: record.kind,
        record_id: record.id,
        disputed_at: record.disputedAt,
        target_devices: result.total,
        delivered_devices: result.delivered,
      },
    })
  }

  if (escalated.length > 0) {
    const identity = escalated.map(record => `${record.kind}:${record.id}:${record.disputedAt}`).sort().join(',')
    const names = [...new Set(escalated.map(record => activeStores.get(record.storeId)))].slice(0, 5).join('、')
    const escalation = await notifyReviewersOfEscalation({
      title: '退回帳目仍待修改',
      body: `${names}共有 ${escalated.length} 筆帳目退回超過 ${delayLabel}，請追蹤處理。`,
      url: '/hq/accounting',
      sourceKey: `hq-returned-${identity}`,
      storeId: escalated.length === 1 ? escalated[0].storeId : undefined,
    })
    targetDevices += escalation.total
    delivered += escalation.delivered
  }

  return { eligible: pending.length, skippedAsAlreadySent, targetDevices, delivered }
}
