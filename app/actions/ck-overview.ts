'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { getCachedUserProfile } from '@/lib/cached-queries'
import { getCKRangeStats, getCKMonthlyStats, type CKDailyStats, type CKMonthlyStats } from '@/lib/ck-aggregator'
import { loadCKDailyDetails } from '@/lib/ck-daily-detail'

async function checkHqAuth() {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  // getVerifiedUser 已使用相同的短快取確認帳號仍啟用；這裡沿用快取取得權限，
  // 避免每次點央廚明細又多一次 user_profiles 網路查詢。
  const profile = await getCachedUserProfile(user.id)
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

/** 撈 CK 當日完整 record（含照片、成員訂單、支出、狀態）給總覽內嵌審核用 */
export async function fetchCKDailyDetail(ckStoreId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !date) return { error: '缺少參數' as const }
  const details = await loadCKDailyDetails([ckStoreId], date)
  if (!(ckStoreId in details)) return { error: '找不到央廚' as const }
  return { success: true as const, detail: details[ckStoreId] }
}

export async function fetchCKMonthlyStats(ckStoreId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !year || !monthNum) return { error: '缺少參數' as const }
  const stats = await getCKMonthlyStats(ckStoreId, year, monthNum)
  return { success: true as const, stats: stats as CKMonthlyStats }
}
