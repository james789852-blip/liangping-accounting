'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export interface ReconciliationRow {
  business_date: string
  ck_store_name: string       // 央廚
  member_store_id: string
  member_store_name: string   // 店家
  ck_reported_amount: number  // 央廚該日輸入該店叫貨金額 (ck_store_orders.amount)
  ck_confirmed_amount: number | null // 央廚確認後金額 (ck_store_orders.ck_confirmed_amount)
  store_reported_amount: number      // 店家該日 daily_closings.total_cost
  variance: number            // 央廚 - 店家 差額
  status: 'match' | 'mismatch' | 'ck_only' | 'store_only'
}

/**
 * 抓一個月內某央廚 vs 所有成員店家的叫貨量對比
 * 央廚方：ck_store_orders (per date, per store)
 * 店家方：daily_closings.total_cost (per date, per store — 店家自己輸入的央廚配送金額)
 */
export async function fetchCKReconciliation(ckStoreId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!ckStoreId || !year || !monthNum) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  // 央廚店家 + assigned 成員店家
  const { data: ckStoreRow } = await admin.from('stores')
    .select('id, name, assigned_store_ids').eq('id', ckStoreId).single()
  if (!ckStoreRow) return { error: '找不到央廚' as const }

  const assignedIds = ((ckStoreRow as any).assigned_store_ids as string[] | null) ?? []
  const { data: memberStores } = assignedIds.length > 0
    ? await admin.from('stores').select('id, name').in('id', assignedIds)
    : { data: [] }
  const memberNameById: Record<string, string> = {}
  for (const s of memberStores ?? []) memberNameById[s.id] = s.name as string

  // 央廚：ck_daily_records + ck_store_orders
  const { data: ckRecords } = await admin.from('ck_daily_records')
    .select('id, business_date')
    .eq('ck_store_id', ckStoreId)
    .gte('business_date', firstDay).lte('business_date', lastDay)
  const recordIds = (ckRecords ?? []).map(r => r.id)
  const recordDateById: Record<string, string> = {}
  for (const r of ckRecords ?? []) recordDateById[r.id] = r.business_date as string

  const { data: ckOrders } = recordIds.length > 0
    ? await admin.from('ck_store_orders')
        .select('ck_daily_record_id, store_id, amount, ck_confirmed_amount')
        .in('ck_daily_record_id', recordIds)
        .not('store_id', 'is', null)
    : { data: [] }

  // 店家：daily_closings.total_cost（店家輸入的央廚配送金額）
  const { data: closings } = assignedIds.length > 0
    ? await admin.from('daily_closings')
        .select('business_date, store_id, total_cost')
        .in('store_id', assignedIds)
        .gte('business_date', firstDay).lte('business_date', lastDay)
    : { data: [] }

  // 組合 key = `${date}||${store_id}`
  const ckMap: Record<string, { reported: number; confirmed: number | null }> = {}
  for (const o of ckOrders ?? []) {
    const date = recordDateById[(o.ck_daily_record_id as string)]
    if (!date || !o.store_id) continue
    const key = `${date}||${o.store_id}`
    ckMap[key] = {
      reported: (o.amount as number) ?? 0,
      confirmed: o.ck_confirmed_amount as number | null,
    }
  }
  const storeMap: Record<string, number> = {}
  for (const c of closings ?? []) {
    const key = `${c.business_date}||${c.store_id}`
    storeMap[key] = (storeMap[key] ?? 0) + ((c.total_cost as number) ?? 0)
  }

  const keys = new Set([...Object.keys(ckMap), ...Object.keys(storeMap)])
  const rows: ReconciliationRow[] = []
  for (const k of keys) {
    const [date, storeId] = k.split('||')
    const ck = ckMap[k]
    const storeAmt = storeMap[k] ?? 0
    const ckAmt = ck?.reported ?? 0
    const variance = ckAmt - storeAmt
    let status: ReconciliationRow['status']
    if (ck && !storeMap[k]) status = 'ck_only'
    else if (!ck && storeAmt > 0) status = 'store_only'
    else if (variance === 0) status = 'match'
    else status = 'mismatch'
    rows.push({
      business_date: date,
      ck_store_name: ckStoreRow.name as string,
      member_store_id: storeId,
      member_store_name: memberNameById[storeId] ?? storeId,
      ck_reported_amount: ckAmt,
      ck_confirmed_amount: ck?.confirmed ?? null,
      store_reported_amount: storeAmt,
      variance,
      status,
    })
  }

  rows.sort((a, b) =>
    a.business_date.localeCompare(b.business_date)
    || a.member_store_name.localeCompare(b.member_store_name)
  )

  const summary = {
    total: rows.length,
    match: rows.filter(r => r.status === 'match').length,
    mismatch: rows.filter(r => r.status === 'mismatch').length,
    ck_only: rows.filter(r => r.status === 'ck_only').length,
    store_only: rows.filter(r => r.status === 'store_only').length,
    total_variance: rows.reduce((s, r) => s + Math.abs(r.variance), 0),
  }

  return { success: true as const, rows, summary }
}
