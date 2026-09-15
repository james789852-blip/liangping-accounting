import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { notifyPushSystemAdministrators } from '@/lib/push-notifications'

export type ScheduledPushResult = {
  eligible: number
  targetDevices: number
  delivered: number
}

export type PushScheduleKey = 'accounting-first' | 'accounting-final' | 'ck-handoff'

const pushScheduleLabels: Record<PushScheduleKey, string> = {
  'accounting-first': '帳目未送出第一次提醒',
  'accounting-final': '帳目未送出第二次提醒',
  'ck-handoff': '央廚補款點交提醒',
}

function businessDateAt(now: Date) {
  const taipei = new Date(now.getTime() + 8 * 3600000)
  if (taipei.getUTCHours() < 5) taipei.setUTCDate(taipei.getUTCDate() - 1)
  return taipei.toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function scheduledPushInstant(businessDate: string, scheduledTime: string) {
  const [year, month, day] = businessDate.split('-').map(Number)
  const [hour, minute] = scheduledTime.split(':').map(Number)
  const calendarOffset = hour < 5 ? 1 : 0
  return new Date(Date.UTC(year, month - 1, day + calendarOffset, hour - 8, minute))
}

export function nextScheduledPushInstant(scheduledTime: string, now = new Date()) {
  const businessDate = businessDateAt(now)
  const today = scheduledPushInstant(businessDate, scheduledTime)
  return today.getTime() > now.getTime()
    ? today
    : scheduledPushInstant(addDays(businessDate, 1), scheduledTime)
}

/**
 * Executes once after the configured time. A failed or abandoned run is reclaimed,
 * so a delayed Vercel cron catches up instead of permanently missing the reminder.
 */
export async function runScheduledPush(input: {
  key: PushScheduleKey
  scheduledTime: string
  run: () => Promise<ScheduledPushResult>
  now?: Date
}) {
  const now = input.now ?? new Date()
  const businessDate = businessDateAt(now)
  const scheduledFor = scheduledPushInstant(businessDate, input.scheduledTime)
  if (now.getTime() < scheduledFor.getTime()) return { due: false as const }

  const admin = createAdminClient()
  const runKey = `${input.key}:${businessDate}:${input.scheduledTime}`
  const startedAt = now.toISOString()
  const { data: inserted, error: insertError } = await admin
    .from('push_schedule_runs')
    .insert({
      run_key: runKey,
      schedule_key: input.key,
      business_date: businessDate,
      scheduled_for: scheduledFor.toISOString(),
      status: 'running',
      started_at: startedAt,
      updated_at: startedAt,
    })
    .select('id, status, attempt_count, updated_at')
    .maybeSingle()

  let runRow = inserted
  if (insertError?.code === '23505') {
    const { data: existing, error } = await admin
      .from('push_schedule_runs')
      .select('id, status, attempt_count, updated_at')
      .eq('run_key', runKey)
      .maybeSingle()
    if (error) throw new Error(`讀取推播排程紀錄失敗：${error.message}`)
    if (!existing || existing.status === 'succeeded') return { due: true as const, skipped: true as const }
    const stale = existing.status === 'running'
      && new Date(existing.updated_at).getTime() > now.getTime() - 10 * 60000
    if (stale) return { due: true as const, skipped: true as const }
    const { data: reclaimed } = await admin.from('push_schedule_runs').update({
      status: 'running',
      attempt_count: Number(existing.attempt_count) + 1,
      started_at: startedAt,
      updated_at: startedAt,
      completed_at: null,
      error_message: null,
    }).eq('id', existing.id).eq('status', existing.status).select('id, status, attempt_count, updated_at').maybeSingle()
    if (!reclaimed) return { due: true as const, skipped: true as const }
    runRow = reclaimed
  } else if (insertError) {
    throw new Error(`建立推播排程紀錄失敗：${insertError.message}`)
  }
  if (!runRow) return { due: true as const, skipped: true as const }

  try {
    const result = await input.run()
    const completedAt = new Date().toISOString()
    await admin.from('push_schedule_runs').update({
      status: 'succeeded',
      eligible_count: result.eligible,
      target_device_count: result.targetDevices,
      delivered_count: result.delivered,
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', runRow.id)
    return { due: true as const, skipped: false as const, ...result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const completedAt = new Date().toISOString()
    await admin.from('push_schedule_runs').update({
      status: 'failed', error_message: message.slice(0, 500),
      completed_at: completedAt, updated_at: completedAt,
    }).eq('id', runRow.id)
    await notifyPushSystemAdministrators({
      title: '帳務推播排程執行失敗',
      body: `${businessDate} ${input.scheduledTime}｜「${pushScheduleLabels[input.key]}」執行失敗，系統將於下次排程自動補送，請至推播管理查看。`,
      sourceKey: `push-schedule-failed-${runKey}-${runRow.attempt_count}`,
    })
    throw error
  }
}
