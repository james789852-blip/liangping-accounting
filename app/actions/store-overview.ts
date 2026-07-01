'use server'

import { createClient } from '@/lib/supabase/server'
import { getRangeStats, getMonthlyStats, type DailyStats, type MonthlyStats } from '@/lib/store-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export async function fetchDailyStats(storeId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  // 同時撈昨日，讓 UI 顯示 delta
  const yesterday = new Date(date + 'T12:00:00+08:00')
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)

  const { days } = await getRangeStats(storeId, yStr, date)
  const prev = days.find(d => d.date === yStr) ?? null
  const cur = days.find(d => d.date === date) ?? null
  return { success: true as const, stats: cur as DailyStats | null, prev: prev as DailyStats | null }
}

export async function fetchMonthlyStats(storeId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !year || !monthNum) return { error: '缺少參數' as const }

  // 同時撈上月，讓 UI 顯示 delta
  const prevYear = monthNum === 1 ? year - 1 : year
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1
  const [stats, prev] = await Promise.all([
    getMonthlyStats(storeId, year, monthNum),
    getMonthlyStats(storeId, prevYear, prevMonth),
  ])
  return { success: true as const, stats: stats as MonthlyStats, prev: prev as MonthlyStats }
}
