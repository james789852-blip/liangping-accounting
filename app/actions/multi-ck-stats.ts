'use server'

import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { sortStores } from '@/lib/store-order'
import { getCKMonthlyStats } from '@/lib/ck-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface MultiCKRow {
  storeId: string
  storeName: string
  memberRevenue: number
  externalRevenue: number
  revenue: number
  food: number
  pack: number
  misc: number
  totalExpense: number
  balance: number
  daysWithRecord: number
  daysInMonth: number
}

export async function fetchMultiCKMonthly(year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!year || !monthNum) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores').select('id, name').eq('active', true).eq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && (now.getMonth() + 1) === monthNum
  const totalDaysInMonth = new Date(year, monthNum, 0).getDate()
  const daysInMonth = isCurrentMonth ? now.getDate() : totalDaysInMonth

  const rows: MultiCKRow[] = []
  for (const s of stores) {
    const m = await getCKMonthlyStats(s.id, year, monthNum)
    const daysWithRecord = m.daily.filter(d => d.status !== 'none').length
    rows.push({
      storeId: s.id,
      storeName: s.name,
      memberRevenue: m.totals.memberRevenue,
      externalRevenue: m.totals.externalRevenue,
      revenue: m.totals.revenue,
      food: m.totals.food,
      pack: m.totals.pack,
      misc: m.totals.misc,
      totalExpense: m.totals.totalExpense,
      balance: m.totals.balance,
      daysWithRecord,
      daysInMonth,
    })
  }

  return { success: true as const, rows }
}
