'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sortStores } from '@/lib/store-order'
import { getMonthlyStats } from '@/lib/store-aggregator'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface MultiStoreRow {
  storeId: string
  storeName: string
  revenue: number
  onsite: number
  actual: number
  ck: number
  variance: number
  food: number
  pack: number
  misc: number
  totalCost: number
  invoiceTotal: number
  receiptTotal: number
  taxRefund: number
}

/** 所有 active 店家的月度 highlight 數字 */
export async function fetchMultiStoreMonthly(year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!year || !monthNum) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores').select('id, name').eq('active', true).neq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  const rows: MultiStoreRow[] = []
  // Sequential fetch — 12+ 店同時 fetch 可能耗 DB。若太慢改 Promise.all 並發
  for (const s of stores) {
    const m = await getMonthlyStats(s.id, year, monthNum)
    rows.push({
      storeId: s.id,
      storeName: s.name,
      revenue: m.totals.revenue,
      onsite: m.totals.onsite,
      actual: m.totals.actual,
      ck: m.totals.ck,
      variance: m.totals.variance,
      food: m.totals.food,
      pack: m.totals.pack,
      misc: m.totals.misc,
      totalCost: m.totals.totalCost,
      invoiceTotal: m.totalInvoice,
      receiptTotal: m.totalReceipt,
      taxRefund: m.liangpingRefund,
    })
  }

  return { success: true as const, rows }
}
