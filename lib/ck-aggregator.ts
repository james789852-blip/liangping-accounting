/**
 * 央廚（CK）資料聚合器 — 對齊 store-aggregator 概念
 *
 * 資料來源：
 *   ck_daily_records + ck_store_orders + ck_expense_items + ck_external_stores
 *
 * Revenue = 央廚輸入的各成員店家訂單 + 外部店家訂單
 * Expense = 食耗雜品項加總
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
  status: 'submitted' | 'draft' | 'verified' | 'disputed' | 'none'
  payerName: string | null
  hqPaid: boolean
  ckReimbursementConfirmed: boolean
  // Revenue
  memberOrders: Array<{ store_id: string; store_name: string; amount: number }>
  externalOrders: Array<{ name: string; amount: number }>
  memberRevenue: number
  externalRevenue: number
  revenue: number
  // Expense
  expenses: Array<{ category: string; item_name: string; amount: number; payer_name?: string; vendor_group?: string; doc_type?: string; note?: string; receipt_photo_url?: string }>
  food: number
  pack: number
  misc: number
  totalExpense: number
  // 依單據類型加總
  invoiceTotal: number    // doc_type=發票
  receiptTotal: number    // doc_type=收據
  estimateTotal: number   // doc_type=估價單
  taxRefund: number       // doc_type=發票 且 vg 含「退稅」
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
    invoiceTotal: number
    receiptTotal: number
    estimateTotal: number
    taxRefund: number
    balance: number
  }
  // 品項月合計（含 vendor_group / doc_type）
  expenseByItem: Array<{ category: string; vendor_group: string; doc_type: string; item_name: string; total: number }>
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
    ckReimbursementConfirmed: false,
    memberOrders: [], externalOrders: [],
    memberRevenue: 0, externalRevenue: 0, revenue: 0,
    expenses: [],
    food: 0, pack: 0, misc: 0, totalExpense: 0,
    invoiceTotal: 0, receiptTotal: 0, estimateTotal: 0, taxRefund: 0,
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
  const [{ data: storeRow }, { data: records }] = await Promise.all([
    admin.from('stores').select('id, name, assigned_store_ids').eq('id', ckStoreId).single(),
    admin.from('ck_daily_records')
      .select('id, business_date, status, payer_name, hq_paid, ck_reimbursement_confirmed, receipt_photo_urls')
      .eq('ck_store_id', ckStoreId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
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
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount, payer_name, vendor_group, doc_type, note, receipt_photo_url').in('ck_daily_record_id', recordIds).order('sort_order')
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
      dd.ckReimbursementConfirmed = rec.ck_reimbursement_confirmed ?? false
      dd.receiptPhotoUrls = ((rec.receipt_photo_urls as string[] | null) ?? [])
      // 訂單
      const ords = (orders ?? []).filter((o: any) => o.ck_daily_record_id === rec.id)
      for (const o of ords) {
        if (o.store_id) {
          const effectiveAmount = Number(o.ck_confirmed_amount ?? 0)
          dd.memberOrders.push({ store_id: o.store_id, store_name: memberStoreMap[o.store_id] ?? o.store_id, amount: effectiveAmount })
          dd.memberRevenue += effectiveAmount
        } else {
          const amount = Number(o.amount ?? 0)
          dd.externalOrders.push({ name: o.external_store_name, amount })
          dd.externalRevenue += amount
        }
      }
      dd.revenue = dd.memberRevenue + dd.externalRevenue
      // 支出
      const exps = (expenses ?? []).filter((e: any) => e.ck_daily_record_id === rec.id)
      for (const e of exps) {
        const vg = (e.vendor_group ?? '') as string
        const doc = (e.doc_type ?? '') as string
        const note = typeof e.note === 'string' ? e.note.trim() : ''
        dd.expenses.push({
          category: e.category, item_name: e.item_name, amount: e.amount ?? 0,
          payer_name: e.payer_name ?? undefined,
          vendor_group: vg || undefined, doc_type: doc || undefined,
          note: note || undefined,
          receipt_photo_url: e.receipt_photo_url ?? undefined,
        })
        const amt = e.amount ?? 0
        if (e.category === '食材') dd.food += amt
        else if (e.category === '耗材') dd.pack += amt
        else dd.misc += amt
        // 依單據類型加總
        if (doc === '發票') {
          dd.invoiceTotal += amt
          if (vg.includes('退稅')) dd.taxRefund += amt
        } else if (doc === '收據') {
          dd.receiptTotal += amt
        } else if (doc === '估價單') {
          dd.estimateTotal += amt
        }
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

  // 撈成員店家 (assigned_store_ids) 名字，用來確保就算某店該月沒訂單，仍顯示欄
  const admin = createAdminClient()
  const assignedIds = (ckStore.assigned_store_ids ?? []) as string[]
  const memberStoreOrder: Array<{ id: string; name: string }> = []
  if (assignedIds.length > 0) {
    const { data: memberStoreRows } = await admin.from('stores').select('id, name').in('id', assignedIds)
    const nameById = Object.fromEntries((memberStoreRows ?? []).map((s: any) => [s.id, s.name as string]))
    for (const id of assignedIds) memberStoreOrder.push({ id, name: nameById[id] ?? id })
  }
  const externalStoreOrder: string[] = []
  const { data: externalStoreRows } = await admin
    .from('ck_external_stores')
    .select('name')
    .eq('ck_store_id', ckStoreId)
  for (const row of externalStoreRows ?? []) {
    const name = String((row as any).name ?? '').trim()
    if (name && !externalStoreOrder.includes(name)) externalStoreOrder.push(name)
  }

  const totals = {
    memberRevenue: 0, externalRevenue: 0, revenue: 0,
    food: 0, pack: 0, misc: 0, totalExpense: 0,
    invoiceTotal: 0, receiptTotal: 0, estimateTotal: 0, taxRefund: 0,
    balance: 0,
  }
  const itemMap: Record<string, { category: string; vendor_group: string; doc_type: string; item_name: string; total: number }> = {}
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
    totals.invoiceTotal += d.invoiceTotal
    totals.receiptTotal += d.receiptTotal
    totals.estimateTotal += d.estimateTotal
    totals.taxRefund += d.taxRefund
    totals.balance += d.balance
    for (const e of d.expenses) {
      const vg = e.vendor_group ?? ''
      const doc = e.doc_type ?? ''
      const key = `${e.category}||${vg}||${doc}||${e.item_name}`
      if (!itemMap[key]) itemMap[key] = { category: e.category, vendor_group: vg, doc_type: doc, item_name: e.item_name, total: 0 }
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

  // memberByStore：優先照 assigned_store_ids 順序（含 total=0 的），再補未預先 assigned 但實際有訂單過的
  const orderedMembers = memberStoreOrder.map(m => ({
    store_id: m.id,
    store_name: m.name,
    total: memberMap[m.id]?.total ?? 0,
  }))
  const extraMembers = Object.values(memberMap)
    .filter(m => !memberStoreOrder.find(x => x.id === m.store_id))
    .sort((a, b) => b.total - a.total)
  const orderedExternal = externalStoreOrder.map(name => ({
    name,
    total: externalMap[name]?.total ?? 0,
  }))
  const extraExternal = Object.values(externalMap)
    .filter(e => !externalStoreOrder.includes(e.name))
    .sort((a, b) => b.total - a.total)

  return {
    year, monthNum, ckStore, daily: days, totals,
    expenseByItem: Object.values(itemMap).sort((a, b) => b.total - a.total),
    memberByStore: [...orderedMembers, ...extraMembers],
    externalByName: [...orderedExternal, ...extraExternal],
  }
}
