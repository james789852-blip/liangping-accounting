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
  storeNotClosed: Array<{ id: string; name: string }>
  storeInDraft: Array<{ id: string; name: string }>
  storeInDispute: Array<{ id: string; name: string }>
  ckNotSubmitted: Array<{ id: string; name: string }>
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

  const storeNotClosed: HQAlerts['storeNotClosed'] = []
  const storeInDraft: HQAlerts['storeInDraft'] = []
  const storeInDispute: HQAlerts['storeInDispute'] = []
  for (const s of storeList) {
    if (closedTodayStores.has(s.id as string)) continue // 公休不算
    const status = closingByStore.get(s.id as string)
    if (!status) storeNotClosed.push({ id: s.id, name: s.name })
    else if (status === 'draft') storeInDraft.push({ id: s.id, name: s.name })
    else if (status === 'disputed') storeInDispute.push({ id: s.id, name: s.name })
  }

  // 今日央廚 ck_daily_records
  const { data: todayCK } = await admin.from('ck_daily_records')
    .select('ck_store_id, status').eq('business_date', today)
  const ckByStore = new Map<string, string>(
    (todayCK ?? []).map((c: any) => [c.ck_store_id as string, c.status as string])
  )
  const ckNotSubmitted: HQAlerts['ckNotSubmitted'] = []
  for (const s of ckList) {
    const status = ckByStore.get(s.id as string)
    if (status !== 'submitted') ckNotSubmitted.push({ id: s.id, name: s.name })
  }

  return {
    success: true,
    alerts: { today, storeNotClosed, storeInDraft, storeInDispute, ckNotSubmitted },
  }
}
