/**
 * 央廚（CK）資料聚合器 — 對齊 store-aggregator 概念
 *
 * 資料來源：
 *   ck_daily_records + ck_store_orders + ck_expense_items + ck_external_stores
 *
 * Daily revenue = 央廚輸入的各成員店家訂單 + 外部店家訂單
 * Monthly revenue = 每日營業額合計 + 梁平退稅（整月只加一次）
 * Expense = 食耗雜品項加總
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'
import { resolveCentralKitchenExpenseDocType } from '@/lib/ck-expense-doc-type'
import { normalizeItemAmount } from '@/lib/negative-items'
import { normalizeVendorGroupName } from '@/lib/linked-receipt-category'

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
  deductibleExternalRevenue: number
  memberRevenue: number
  externalRevenue: number
  revenue: number
  // Expense
  expenses: Array<{ category: string; item_name: string; amount: number; payer_name?: string; vendor_group?: string; doc_type?: string; note?: string; receipt_photo_url?: string; is_refund?: boolean }>
  food: number
  pack: number
  misc: number
  totalExpense: number
  // 依單據類型加總
  invoiceTotal: number    // doc_type=發票
  receiptTotal: number    // doc_type=收據
  estimateTotal: number   // doc_type=估價單
  taxRefund: number       // 依品項對應管理 is_refund 計算；未設定時才回退舊規則
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
    memberOrders: [], externalOrders: [], deductibleExternalRevenue: 0,
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
  scope: { verifiedOnly?: boolean } = {},
): Promise<{ ckStore: CKStoreInfo; days: CKDailyStats[] }> {
  const admin = createAdminClient()
  let recordsQuery = admin.from('ck_daily_records')
    .select('id, business_date, status, payer_name, hq_paid, ck_reimbursement_confirmed, receipt_photo_urls')
    .eq('ck_store_id', ckStoreId)
    .gte('business_date', firstDay).lte('business_date', lastDay)
  if (scope.verifiedOnly) recordsQuery = recordsQuery.eq('status', 'verified')

  const [{ data: storeRow }, { data: records }, mappingItems] = await Promise.all([
    admin.from('stores').select('id, name, assigned_store_ids').eq('id', ckStoreId).single(),
    recordsQuery,
    getStoreItemsFromMappings(ckStoreId, { reportMonth: firstDay.slice(0, 7) }),
  ])
  const ckStore = (storeRow ?? { id: ckStoreId, name: '' }) as CKStoreInfo
  const assignedIds = (ckStore.assigned_store_ids ?? []) as string[]

  const { data: externalStoreRows } = await admin
    .from('ck_external_stores')
    .select('*')
    .eq('ck_store_id', ckStoreId)
  const deductibleExternalNames = new Set(
    (externalStoreRows ?? [])
      .filter((row: any) => row.deduct_from_reimbursement ?? (
        String(ckStore.name ?? '').trim().startsWith('泉州') && String(row.name ?? '').trim() === '食咣雞'
      ))
      .map((row: any) => String(row.name ?? '').trim())
      .filter(Boolean),
  )

  const recordIds = (records ?? []).map(r => r.id)
  const [{ data: orders }, { data: expenses }] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount, payer_name, vendor_group, doc_type, note, receipt_photo_url').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  // 店名必須同時依「目前指派」與「該月份實際歷史訂單」查詢。
  // 否則店家在後續月份解除央廚配送後，重匯舊月份會找不到名稱而顯示 store UUID。
  const historicalMemberStoreIds = (orders ?? [])
    .map((order: any) => order.store_id as string | null)
    .filter((storeId): storeId is string => !!storeId)
  const memberStoreIds = Array.from(new Set([...assignedIds, ...historicalMemberStoreIds]))
  const memberStoreMap: Record<string, string> = {}
  if (memberStoreIds.length > 0) {
    const { data: memberStores } = await admin.from('stores').select('id, name').in('id', memberStoreIds)
    for (const store of memberStores ?? []) memberStoreMap[store.id] = store.name
  }

  const recordByDate = new Map((records ?? []).map(r => [r.business_date as string, r] as const))
  const compact = (value?: string | null) => String(value ?? '').replace(/[\s　]/g, '')
  const vendorGroupKey = (value?: string | null) => compact(normalizeVendorGroupName(value))
  const hasExplicitRefundMappings = mappingItems.some(item => item.is_refund)
  const findMappedItem = (vendorGroup: string, docType: string, itemName: string) => {
    const vendor = vendorGroupKey(vendorGroup)
    const doc = compact(docType)
    const item = compact(itemName)
    return mappingItems.find(mapping =>
      vendorGroupKey(mapping.vendor_group) === vendor
      && compact(mapping.doc_type) === doc
      && compact(mapping.name) === item
    ) ?? mappingItems.find(mapping =>
      vendorGroupKey(mapping.vendor_group) === vendor
      && compact(mapping.name) === item
    ) ?? mappingItems.find(mapping => compact(mapping.name) === item)
  }

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
          const name = String(o.external_store_name ?? '').trim()
          dd.externalOrders.push({ name, amount })
          dd.externalRevenue += amount
          if (deductibleExternalNames.has(name)) dd.deductibleExternalRevenue += amount
        }
      }
      // 支出
      const exps = (expenses ?? []).filter((e: any) => e.ck_daily_record_id === rec.id)
      for (const e of exps) {
        const storedVendorGroup = (e.vendor_group ?? '') as string
        const doc = resolveCentralKitchenExpenseDocType({
          vendorGroup: storedVendorGroup,
          itemName: String(e.item_name ?? ''),
          storedDocType: (e.doc_type ?? '') as string,
          mappings: mappingItems,
        })
        const mappedItem = findMappedItem(storedVendorGroup, doc, String(e.item_name ?? ''))
        const vendorGroup = normalizeVendorGroupName(mappedItem?.vendor_group ?? storedVendorGroup)
        const isRefund = hasExplicitRefundMappings
          ? !!mappedItem?.is_refund
          : doc === '發票' && vendorGroup.includes('退稅')
        const note = typeof e.note === 'string' ? e.note.trim() : ''
        const amt = normalizeItemAmount(String(e.item_name ?? ''), Number(e.amount ?? 0))
        dd.expenses.push({
          category: e.category, item_name: e.item_name, amount: amt,
          payer_name: e.payer_name ?? undefined,
          vendor_group: vendorGroup, doc_type: doc || undefined,
          note: note || undefined,
          receipt_photo_url: e.receipt_photo_url ?? undefined,
          is_refund: isRefund,
        })
        if (e.category === '食材') dd.food += amt
        else if (e.category === '耗材') dd.pack += amt
        else dd.misc += amt
        // 依單據類型加總
        if (doc === '發票') {
          dd.invoiceTotal += amt
        } else if (doc === '收據') {
          dd.receiptTotal += amt
        } else if (doc === '估價單') {
          dd.estimateTotal += amt
        }
        if (isRefund) dd.taxRefund += amt
      }
      dd.totalExpense = dd.food + dd.pack + dd.misc
      // 每日營業額只計各店叫貨；梁平退稅由月合計另外加一次。
      dd.revenue = dd.memberRevenue + dd.externalRevenue
      dd.balance = dd.revenue - dd.totalExpense
    }
    days.push(dd)
  }

  return { ckStore, days }
}

export async function getCKMonthlyStats(
  ckStoreId: string,
  year: number,
  monthNum: number,
  scope: { verifiedOnly?: boolean } = {},
): Promise<CKMonthlyStats> {
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)
  const { ckStore, days } = await getCKRangeStats(ckStoreId, firstDay, lastDay, scope)

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

  // 與 Excel 月合計公式一致：各日營業額合計後，再加一次整月梁平退稅。
  totals.revenue += totals.taxRefund
  totals.balance = totals.revenue - totals.totalExpense

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
