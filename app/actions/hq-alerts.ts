'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessDate } from '@/lib/business-date'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface HQAlerts {
  today: string
  totalStores: number
  totalCkStores: number
  storeCompleted: number
  ckCompleted: number
  storeNotClosed: Array<{ id: string; name: string }>
  storeInDraft: Array<{ id: string; name: string }>
  storePendingReview: Array<{ id: string; name: string }>
  storeInDispute: Array<{ id: string; name: string }>
  ckNotSubmitted: Array<{ id: string; name: string }>
  ckPendingReview: Array<{ id: string; name: string }>
  ckInDispute: Array<{ id: string; name: string }>
  ckHandoffPending: Array<{ id: string; name: string }>
  overdue: OverdueAlert[]
}

export type OverdueAlert = {
  id: string
  storeId: string
  entity: 'store' | 'ck'
  name: string
  date: string
  ageDays: number
  status: 'not_submitted' | 'draft' | 'review' | 'dispute' | 'handoff'
}

function addCalendarDays(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00+08:00`)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function daysSince(date: string, today: string) {
  const from = new Date(`${date}T12:00:00+08:00`).getTime()
  const to = new Date(`${today}T12:00:00+08:00`).getTime()
  return Math.max(1, Math.round((to - from) / 86400000))
}

/** 今日各店結帳異常提醒 */
export async function fetchHQAlerts(): Promise<{ error: string } | { success: true; alerts: HQAlerts }> {
  const auth = await checkHqAuth()
  if ('error' in auth) return { error: auth.error as string }

  const admin = createAdminClient()
  const today = getBusinessDate()

  // 所有 active 店家 / 央廚
  const { data: allStores } = await admin.from('stores')
    .select('id, name, type').eq('active', true)
  const storeList = (allStores ?? []).filter((s: any) => s.type !== '央廚')
  const ckList = (allStores ?? []).filter((s: any) => s.type === '央廚')

  // 今日 daily_closings
  const { data: todayClosings } = await admin.from('daily_closings')
    .select('store_id, status').eq('business_date', today)
  const closingByStore = new Map<string, string>(
    (todayClosings ?? []).map((c: any) => [c.store_id as string, c.status as string])
  )

  // 公休日：今日公休的店家不算「未結帳」
  const { data: holidayRows } = await admin.from('store_holidays')
    .select('store_id').eq('holiday_date', today)
  const closedTodayStores = new Set((holidayRows ?? []).map((h: any) => h.store_id as string))
  const activeStoreIds = new Set(storeList.map((s: any) => s.id as string))
  const activeCkStoreIds = new Set(ckList.map((s: any) => s.id as string))
  const closedActiveStoreCount = [...closedTodayStores].filter(storeId => activeStoreIds.has(storeId)).length
  const closedActiveCkCount = [...closedTodayStores].filter(storeId => activeCkStoreIds.has(storeId)).length

  const storeNotClosed: HQAlerts['storeNotClosed'] = []
  const storeInDraft: HQAlerts['storeInDraft'] = []
  const storePendingReview: HQAlerts['storePendingReview'] = []
  const storeInDispute: HQAlerts['storeInDispute'] = []
  let storeCompleted = 0
  for (const s of storeList) {
    if (closedTodayStores.has(s.id as string)) continue // 公休不算
    const status = closingByStore.get(s.id as string)
    if (!status) storeNotClosed.push({ id: s.id, name: s.name })
    else if (status === 'draft') storeInDraft.push({ id: s.id, name: s.name })
    else if (status === 'submitted') storePendingReview.push({ id: s.id, name: s.name })
    else if (status === 'disputed') storeInDispute.push({ id: s.id, name: s.name })
    else if (status === 'verified') storeCompleted += 1
  }

  // 今日央廚 ck_daily_records
  const { data: todayCK } = await admin.from('ck_daily_records')
    .select('ck_store_id, status, hq_paid, ck_reimbursement_confirmed').eq('business_date', today)
  const ckByStore = new Map<string, any>(
    (todayCK ?? []).map((c: any) => [c.ck_store_id as string, c])
  )
  const ckNotSubmitted: HQAlerts['ckNotSubmitted'] = []
  const ckPendingReview: HQAlerts['ckPendingReview'] = []
  const ckInDispute: HQAlerts['ckInDispute'] = []
  const ckHandoffPending: HQAlerts['ckHandoffPending'] = []
  let ckCompleted = 0
  for (const s of ckList) {
    if (closedTodayStores.has(s.id as string)) continue // 央廚公休不算未送出
    const record = ckByStore.get(s.id as string)
    const status = record?.status as string | undefined
    if (!record || status === 'draft') ckNotSubmitted.push({ id: s.id, name: s.name })
    if (status === 'submitted') ckPendingReview.push({ id: s.id, name: s.name })
    if (status === 'disputed') ckInDispute.push({ id: s.id, name: s.name })
    if (status === 'verified') ckCompleted += 1
    if (record?.hq_paid && !record?.ck_reimbursement_confirmed) ckHandoffPending.push({ id: s.id, name: s.name })
  }

  // 系統自 2026/07/12 起正式使用；只追蹤這天之後的歷史帳目，之前不提醒。
  // 公休日不列入「未送出」，但已建立的草稿／待審核／待點交仍會保留提醒。
  const overdueStart = '2026-07-12'
  const [{ data: recentClosings }, { data: recentCK }, { data: recentHolidays }] = await Promise.all([
    admin.from('daily_closings')
      .select('store_id, business_date, status, updated_at')
      .gte('business_date', overdueStart).lt('business_date', today)
      .order('business_date', { ascending: true }).order('updated_at', { ascending: true }),
    admin.from('ck_daily_records')
      .select('ck_store_id, business_date, status, hq_paid, ck_reimbursement_confirmed, updated_at')
      .gte('business_date', overdueStart).lt('business_date', today)
      .order('business_date', { ascending: true }).order('updated_at', { ascending: true }),
    admin.from('store_holidays')
      .select('store_id, holiday_date')
      .gte('holiday_date', overdueStart).lt('holiday_date', today),
  ])

  const storeStatusByDate = new Map<string, string>()
  for (const row of recentClosings ?? []) {
    storeStatusByDate.set(`${row.store_id}|${row.business_date}`, row.status)
  }
  const ckRecordByDate = new Map<string, { status: string; hq_paid: boolean; ck_reimbursement_confirmed: boolean }>()
  for (const row of recentCK ?? []) {
    ckRecordByDate.set(`${row.ck_store_id}|${row.business_date}`, {
      status: row.status,
      hq_paid: !!row.hq_paid,
      ck_reimbursement_confirmed: !!row.ck_reimbursement_confirmed,
    })
  }
  const holidayKeys = new Set((recentHolidays ?? []).map(row => `${row.store_id}|${row.holiday_date}`))
  const overdue: OverdueAlert[] = []
  const overdueStatus = (status: string | undefined): OverdueAlert['status'] | null => {
    if (!status) return 'not_submitted'
    if (status === 'submitted') return 'review'
    return null
  }
  const startTime = new Date(`${overdueStart}T12:00:00+08:00`).getTime()
  const todayTime = new Date(`${today}T12:00:00+08:00`).getTime()
  const daysToCheck = Math.max(0, Math.floor((todayTime - startTime) / 86400000))
  for (let offset = 0; offset < daysToCheck; offset += 1) {
    const date = addCalendarDays(overdueStart, offset)
    const ageDays = daysSince(date, today)
    for (const s of storeList) {
      const key = `${s.id}|${date}`
      if (holidayKeys.has(key)) continue
      const status = overdueStatus(storeStatusByDate.get(key))
      if (status) overdue.push({ id: `store-${s.id}-${date}`, storeId: s.id, entity: 'store', name: s.name, date, ageDays, status })
    }
    for (const s of ckList) {
      const key = `${s.id}|${date}`
      if (holidayKeys.has(key)) continue
      const record = ckRecordByDate.get(key)
      let status: OverdueAlert['status'] | null = overdueStatus(record?.status)
      if (record?.status === 'verified' && record.hq_paid && !record.ck_reimbursement_confirmed) status = 'handoff'
      if (status) overdue.push({ id: `ck-${s.id}-${date}`, storeId: s.id, entity: 'ck', name: s.name, date, ageDays, status })
    }
  }
  const overdueRank: Record<OverdueAlert['status'], number> = { handoff: 0, review: 1, dispute: 2, draft: 3, not_submitted: 4 }
  overdue.sort((a, b) => a.date.localeCompare(b.date) || overdueRank[a.status] - overdueRank[b.status] || a.name.localeCompare(b.name, 'zh-Hant'))

  return {
    success: true,
    alerts: {
      today,
      totalStores: storeList.length - closedActiveStoreCount,
      totalCkStores: ckList.length - closedActiveCkCount,
      storeCompleted,
      ckCompleted,
      storeNotClosed,
      storeInDraft,
      storePendingReview,
      storeInDispute,
      ckNotSubmitted,
      ckPendingReview,
      ckInDispute,
      ckHandoffPending,
      overdue,
    },
  }
}
