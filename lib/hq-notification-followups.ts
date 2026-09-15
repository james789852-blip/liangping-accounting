import 'server-only'

import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export type HQFollowUpKind = 'accounting_missing' | 'returned_accounting' | 'ck_handoff'
export type HQFollowUpStatus = 'pending' | 'in_progress' | 'resolved'

export type HQFollowUpPayload = {
  business_date?: string
  targets?: Array<{
    kind?: 'store' | 'ck'
    store_id?: string
    record_id?: string
    disputed_at?: string
    reimbursement_sent_at?: string
  }>
}

type HQFollowUpRow = {
  id: string
  kind: HQFollowUpKind
  payload: HQFollowUpPayload | null
  status: HQFollowUpStatus
  title: string
}

function sameInstant(left: unknown, right: unknown) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  return Number.isFinite(leftTime) && leftTime === rightTime
}

export async function createHQNotificationFollowUp(input: {
  sourceKey: string
  kind: HQFollowUpKind
  title: string
  body: string
  url: string
  storeId?: string
  payload: HQFollowUpPayload
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('hq_notification_followups').upsert({
    source_key: input.sourceKey,
    kind: input.kind,
    store_id: input.storeId ?? null,
    title: input.title,
    body: input.body,
    url: input.url,
    payload: input.payload,
  }, {
    onConflict: 'source_key',
    ignoreDuplicates: true,
  })
  if (error) console.error('[hq-follow-up] failed to create:', error)
  return !error
}

async function accountingTargetResolved(
  target: NonNullable<HQFollowUpPayload['targets']>[number],
  businessDate: string,
) {
  if (!target.store_id || (target.kind !== 'store' && target.kind !== 'ck')) return false
  const admin = createAdminClient()
  const table = target.kind === 'ck' ? 'ck_daily_records' : 'daily_closings'
  const storeColumn = target.kind === 'ck' ? 'ck_store_id' : 'store_id'
  const [{ data: record, error }, { data: store }, { data: holiday }] = await Promise.all([
    admin.from(table).select('status').eq(storeColumn, target.store_id).eq('business_date', businessDate).maybeSingle(),
    admin.from('stores').select('active').eq('id', target.store_id).maybeSingle(),
    admin.from('store_holidays').select('store_id').eq('store_id', target.store_id).eq('holiday_date', businessDate).maybeSingle(),
  ])
  if (error) return false
  return record?.status === 'submitted' || record?.status === 'verified' || store?.active === false || !!holiday
}

async function returnedTargetResolved(target: NonNullable<HQFollowUpPayload['targets']>[number]) {
  if (!target.record_id || !target.disputed_at || (target.kind !== 'store' && target.kind !== 'ck')) return false
  const admin = createAdminClient()
  const table = target.kind === 'ck' ? 'ck_daily_records' : 'daily_closings'
  const { data, error } = await admin.from(table).select('status, updated_at').eq('id', target.record_id).maybeSingle()
  if (error) return false
  if (!data) return true
  return data.status !== 'disputed' || !sameInstant(data.updated_at, target.disputed_at)
}

async function ckHandoffTargetResolved(target: NonNullable<HQFollowUpPayload['targets']>[number]) {
  if (!target.record_id || !target.reimbursement_sent_at) return false
  const admin = createAdminClient()
  const { data, error } = await admin.from('ck_daily_records')
    .select('hq_paid, ck_reimbursement_confirmed, hq_reimbursement_sent_at')
    .eq('id', target.record_id)
    .maybeSingle()
  if (error) return false
  if (!data) return true
  return data.hq_paid !== true
    || data.ck_reimbursement_confirmed === true
    || !sameInstant(data.hq_reimbursement_sent_at, target.reimbursement_sent_at)
}

async function followUpResolved(row: HQFollowUpRow) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const targets = Array.isArray(payload.targets) ? payload.targets : []
  if (targets.length === 0) return false

  if (row.kind === 'accounting_missing') {
    if (typeof payload.business_date !== 'string') return false
    const states = await Promise.all(targets.map(target => accountingTargetResolved(target, payload.business_date!)))
    return states.every(Boolean)
  }
  if (row.kind === 'returned_accounting') {
    const states = await Promise.all(targets.map(returnedTargetResolved))
    return states.every(Boolean)
  }
  const states = await Promise.all(targets.map(ckHandoffTargetResolved))
  return states.every(Boolean)
}

/** Automatically close claimed or unclaimed HQ follow-ups after their underlying issue is gone. */
export async function resolveCompletedHQNotificationFollowUps(limit = 100) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('hq_notification_followups')
    .select('id, kind, payload, status, title')
    .neq('status', 'resolved')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.error('[hq-follow-up] failed to load:', error)
    return { checked: 0, resolved: 0 }
  }

  let resolved = 0
  for (const row of (data ?? []) as HQFollowUpRow[]) {
    if (!await followUpResolved(row)) continue
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin.from('hq_notification_followups').update({
      status: 'resolved',
      resolved_at: now,
      updated_at: now,
    }).eq('id', row.id).neq('status', 'resolved').select('id').maybeSingle()
    if (updateError || !updated) continue
    resolved += 1
    await logAudit({
      eventType: 'hq_follow_up_resolved',
      description: `異常追蹤已由系統自動完成：${row.title}`,
      metadata: { follow_up_id: row.id, follow_up_kind: row.kind },
    })
  }
  return { checked: data?.length ?? 0, resolved }
}
