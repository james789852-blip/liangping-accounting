/**
 * 央廚（CK）資料聚合器 — 對齊 store-aggregator 概念
 *
 * 資料來源：
 *   ck_daily_records + ck_store_orders + ck_expense_items + ck_external_stores
 *
 * Revenue = 各成員店家訂單 + 外部店家訂單
 * Expense = 食耗雜品項加總
 * Balance = Revenue − Expense
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface CKStoreInfo {
  id: string
  name: string
  assigned_store_ids?: string[] | null
}

export interface CKDailyStats {
  date: string
  weekday: string
  status: 'submitted' | 'draft' | 'none'
  payerName: string | null
  hqPaid: boolean
  // Revenue
  memberOrders: Array<{ store_id: string; store_name: string; amount: number }>
  externalOrders: Array<{ name: string; amount: number }>
  memberRevenue: number
  externalRevenue: number
  revenue: number
  // Expense
  expenses: Array<{ category: string; item_name: string; amount: number; payer_name?: string }>
  food: number
  pack: number
  misc: number
  totalExpense: number
  // Balance
  balance: number
  receiptPhotoUrls: string[]
}

export interface CKMonthlyStats {
  year: number
  monthNum: number
  ckStore: CKStoreInfo
  daily: CKDailyStats[]
  totals: {
    memberRevenue: number
    externalRevenue: number
    revenue: number
    food: number
    pack: number
    misc: number
    totalExpense: number
    balance: number
  }
  // 品項月合計
  expenseByItem: Array<{ category: string; item_name: string; total: number }>
  // 分店訂單月合計
  memberByStore: Array<{ store_id: string; store_name: string; total: number }>
  externalByName: Array<{ name: string; total: number }>
}

function emptyDay(date: string): CKDailyStats {
  const dt = new Date(date + 'T12:00:00+08:00')
  return {
    date,
    weekday: `星期${WEEKDAYS[dt.getDay()]}`,
    status: 'none',
    payerName: null,
    hqPaid: false,
    memberOrders: [], externalOrders: [],
    memberRevenue: 0, externalRevenue: 0, revenue: 0,
    expenses: [],
    food: 0, pack: 0, misc: 0, totalExpense: 0,
    balance: 0,
    receiptPhotoUrls: [],
  }
}

export async function getCKRangeStats(
  ckStoreId: string,
  firstDay: string,
  lastDay: string,
): Promise<{ ckStore: CKStoreInfo; days: CKDailyStats[] }> {
  const admin = createAdminClient()
  const [{ data: storeRow }, { data: records }, { data: externalStoreRows }] = await Promise.all([
    admin.from('stores').select('id, name, assigned_store_ids').eq('id', ckStoreId).single(),
    admin.from('ck_daily_records')
      .select('id, business_date, status, payer_name, hq_paid, receipt_photo_urls')
      .eq('ck_store_id', ckStoreId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('ck_external_stores').select('id, name').eq('ck_store_id', ckStoreId),
  ])
  const ckStore = (storeRow ?? { id: ckStoreId, name: '' }) as CKStoreInfo
  const assignedIds = (ckStore.assigned_store_ids ?? []) as string[]

  // 成員店家名字
  const memberStoreMap: Record<string, string> = {}
  if (assignedIds.length > 0) {
    const { data: memberStores } = await admin.from('stores').select('id, name').in('id', assignedIds)
    for (const s of memberStores ?? []) memberStoreMap[s.id] = s.name
  }

  const recordIds = (records ?? []).map(r => r.id)
  const [{ data: orders }, { data: expenses }] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount, payer_name').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  const recordByDate = new Map((records ?? []).map(r => [r.business_date as string, r] as const))

  // 補齊日曆
  const startDate = new Date(firstDay + 'T12:00:00+08:00')
  const endDate = new Date(lastDay + 'T12:00:00+08:00')
  const days: CKDailyStats[] = []
  for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${d}`
    const dd = emptyDay(date)
    const rec = recordByDate.get(date)
    if (rec) {
      dd.status = (rec.status ?? 'none') as CKDailyStats['status']
      dd.payerName = rec.payer_name ?? null
      dd.hqPaid = rec.hq_paid ?? false
      dd.receiptPhotoUrls = ((rec.receipt_photo_urls as string[] | null) ?? [])
      // 訂單
      const ords = (orders ?? []).filter((o: any) => o.ck_daily_record_id === rec.id)
      for (const o of ords) {
        if (o.store_id) {
          dd.memberOrders.push({ store_id: o.store_id, store_name: memberStoreMap[o.store_id] ?? o.store_id, amount: o.amount ?? 0 })
          dd.memberRevenue += o.amount ?? 0
        } else {
          dd.externalOrders.push({ name: o.external_store_name, amount: o.amount ?? 0 })
          dd.externalRevenue += o.amount ?? 0
        }
      }
      dd.revenue = dd.memberRevenue + dd.externalRevenue
      // 支出
      const exps = (expenses ?? []).filter((e: any) => e.ck_daily_record_id === rec.id)
      for (const e of exps) {
        dd.expenses.push({ category: e.category, item_name: e.item_name, amount: e.amount ?? 0, payer_name: e.payer_name ?? undefined })
        const amt = e.amount ?? 0
        if (e.category === '食材') dd.food += amt
        else if (e.category === '耗材') dd.pack += amt
        else dd.misc += amt
      }
      dd.totalExpense = dd.food + dd.pack + dd.misc
      dd.balance = dd.revenue - dd.totalExpense
    }
    days.push(dd)
  }

  return { ckStore, days }
}

export async function getCKMonthlyStats(ckStoreId: string, year: number, monthNum: number): Promise<CKMonthlyStats> {
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)
  const { ckStore, days } = await getCKRangeStats(ckStoreId, firstDay, lastDay)

  const totals = {
    memberRevenue: 0, externalRevenue: 0, revenue: 0,
    food: 0, pack: 0, misc: 0, totalExpense: 0, balance: 0,
  }
  const itemMap: Record<string, { category: string; item_name: string; total: number }> = {}
  const memberMap: Record<string, { store_id: string; store_name: string; total: number }> = {}
  const externalMap: Record<string, { name: string; total: number }> = {}

  for (const d of days) {
    totals.memberRevenue += d.memberRevenue
    totals.externalRevenue += d.externalRevenue
    totals.revenue += d.revenue
    totals.food += d.food
    totals.pack += d.pack
    totals.misc += d.misc
    totals.totalExpense += d.totalExpense
    totals.balance += d.balance
    for (const e of d.expenses) {
      const key = `${e.category}||${e.item_name}`
      if (!itemMap[key]) itemMap[key] = { category: e.category, item_name: e.item_name, total: 0 }
      itemMap[key].total += e.amount
    }
    for (const o of d.memberOrders) {
      if (!memberMap[o.store_id]) memberMap[o.store_id] = { store_id: o.store_id, store_name: o.store_name, total: 0 }
      memberMap[o.store_id].total += o.amount
    }
    for (const o of d.externalOrders) {
      if (!externalMap[o.name]) externalMap[o.name] = { name: o.name, total: 0 }
      externalMap[o.name].total += o.amount
    }
  }

  return {
    year, monthNum, ckStore, daily: days, totals,
    expenseByItem: Object.values(itemMap).sort((a, b) => b.total - a.total),
    memberByStore: Object.values(memberMap).sort((a, b) => b.total - a.total),
    externalByName: Object.values(externalMap).sort((a, b) => b.total - a.total),
  }
}
