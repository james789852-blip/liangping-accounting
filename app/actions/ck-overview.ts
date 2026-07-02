'use server'

import { createClient } from '@/lib/supabase/server'
import { getCKRangeStats, getCKMonthlyStats, type CKDailyStats, type CKMonthlyStats } from '@/lib/ck-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export async function fetchCKDailyStats(ckStoreId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !date) return { error: '缺少參數' as const }
  const { days } = await getCKRangeStats(ckStoreId, date, date)
  return { success: true as const, stats: days[0] as CKDailyStats | undefined }
}

export async function fetchCKMonthlyStats(ckStoreId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !year || !monthNum) return { error: '缺少參數' as const }
  const stats = await getCKMonthlyStats(ckStoreId, year, monthNum)
  return { success: true as const, stats: stats as CKMonthlyStats }
}
