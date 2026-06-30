'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'
import { getStoreItemsResolved } from '@/lib/store-items-resolver'
import { aggregateMonthStats, type DayData, type StoreInfo } from '@/lib/native-excel-export'

function emptyDay(): DayData {
  return { pos: 0, online: 0, online_cash: 0, uber: {}, panda: 0, twpay: 0, nft: 0, actual: 0, ck: 0, total_revenue: 0, items: {}, notes: {}, ckItems: {} }
}

export async function getMonthlyStats(storeId: string, year: number, monthNum: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  if (!storeId || !year || !monthNum) return { error: '缺少參數' }

  const admin = createAdminClient()
  const { data: storeRow } = await admin.from('stores')
    .select('id, name, mode, closing_layout, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, online_cash_enabled, nft_enabled')
    .eq('id', storeId).single()
  if (!storeRow) return { error: '找不到店家' }
  const store = storeRow as unknown as StoreInfo

  const items = await getStoreItemsResolved(storeId)
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  const [{ data: closings }, { data: receipts }] = await Promise.all([
    admin.from('daily_closings')
      .select('business_date, status, updated_at, actual_remit, total_revenue, total_cost, revenue_items(channel, account_name, gross_amount), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay)
      .order('updated_at', { ascending: true }),
    admin.from('receipts')
      .select('business_date, vendor_name, total_amount, tax_amount, notes, receipt_items(item_name, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
  ])

  // 同日多筆 closings → 取最新（status 優先序高的）
  const STATUS_PRIORITY: Record<string, number> = { verified: 4, submitted: 3, disputed: 2, draft: 1 }
  const byDate: Record<string, any[]> = {}
  for (const c of (closings ?? []) as any[]) {
    if (!byDate[c.business_date]) byDate[c.business_date] = []
    byDate[c.business_date].push(c)
  }
  const dataByDate: Record<string, DayData> = {}
  for (const [date, arr] of Object.entries(byDate)) {
    const best = arr.sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0))[0]
    const dd = emptyDay()
    dd.actual = best.actual_remit ?? 0
    dd.ck = best.total_cost ?? 0
    dd.total_revenue = best.total_revenue ?? 0
    for (const r of (best.revenue_items ?? [])) {
      const ch = r.channel
      const amt = r.gross_amount ?? 0
      if (ch === 'pos') dd.pos += amt
      else if (ch === 'uber') dd.uber[r.account_name ?? 'uber'] = (dd.uber[r.account_name ?? 'uber'] ?? 0) + amt
      else if (ch === 'panda') dd.panda += amt
      else if (ch === 'twpay') dd.twpay += amt
      else if (ch === 'online') dd.online += amt
      else if (ch === 'online_cash') dd.online_cash += amt
      else if (ch === 'nft') dd.nft += amt
    }
    dataByDate[date] = dd
  }
  // receipts 計入 items (簡化版：把 receipts.total_amount 算進對應 vendor_group)
  for (const r of (receipts ?? []) as any[]) {
    const dd = dataByDate[r.business_date] ?? (dataByDate[r.business_date] = emptyDay())
    for (const ri of (r.receipt_items ?? [])) {
      dd.items[ri.item_name] = (dd.items[ri.item_name] ?? 0) + (ri.amount ?? 0)
    }
  }

  const stats = aggregateMonthStats(items as any, dataByDate, store)
  return { success: true as const, stats, storeName: store.name }
}
