import type { ReactNode } from 'react'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getBusinessDate } from '@/lib/business-date'
import { BarChart3, Calendar, ChefHat, ChevronDown, LayoutDashboard, Store } from 'lucide-react'
import { getCachedAllStores, getCachedUserProfile } from '@/lib/cached-queries'
import { canExportReports, canReviewClosings } from '@/lib/user-permissions'
import { getCKRangeStats } from '@/lib/ck-aggregator'
import { resolveReportingActualVendor } from '@/lib/reporting-actual-vendor'
import { fetchAllPaged } from '@/lib/supabase-paged'
import {
  buildReceiptStatisticsHierarchy,
  receiptStatisticsCategoryOrder,
  resolveReceiptStatisticsCategory,
} from '@/lib/receipt-statistics-hierarchy'
import { allocateReceiptStatistics, TAX_EXEMPT_RICE_GROUP } from '@/lib/receipt-statistics-allocation'

export const dynamic = 'force-dynamic'

function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }

type VendorDetail = {
  name: string
  total: number
  count: number
  taxExemptRiceTotal: number
  taxExemptRiceCount: number
}
type ReceiptDetail = {
  id: string
  date: string
  total: number
  actualVendor: string
  note: string
  items: string[]
}
type VendorStat = {
  storeId: string
  storeName: string
  category: string
  group: string
  total: number
  count: number
  vendors: VendorDetail[]
  details: ReceiptDetail[]
}
type ReceiptCategoryStat = { name: string; total: number; count: number; groups: VendorStat[] }
type DeliveryStoreStat = { name: string; total: number; count: number }
type StoreSummary = {
  id: string
  name: string
  type?: string | null
  revenue: number
  taxRefund: number
  cost: number
  costRate: number
  receiptCategories: ReceiptCategoryStat[]
  deliveryStores: DeliveryStoreStat[]
}

export default async function HQDashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  if (!canReviewClosings(profile) && !canExportReports(profile)) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const today = getBusinessDate()
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const params = await searchParams
  const requestedYear = Number(params.year)
  const requestedMonth = Number(params.month)
  const yearNumber = Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= todayYear
    ? requestedYear
    : todayYear
  const monthNumber = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : todayMonth
  const year = String(yearNumber)
  const month = String(monthNumber).padStart(2, '0')
  const firstOfMonth = `${year}-${month}-01`
  const lastDay = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate()
  const selectedEnd = yearNumber === todayYear && monthNumber === todayMonth
    ? today
    : `${year}-${month}-${String(lastDay).padStart(2, '0')}`

  const [stores, monthClosings, monthReceipts, receiptCategories, receiptVendors, itemMappings] = await Promise.all([
    getCachedAllStores(),
    fetchAllPaged<any>(() => admin.from('daily_closings')
      .select('store_id, total_revenue, status')
      .gte('business_date', firstOfMonth).lte('business_date', selectedEnd)
      .in('status', ['submitted', 'verified'])),
    fetchAllPaged<any>(() => admin.from('receipts')
      .select('id, store_id, business_date, vendor_name, actual_vendor_name, total_amount, notes, receipt_items(item_name, amount)')
      .gte('business_date', firstOfMonth).lte('business_date', selectedEnd)),
    fetchAllPaged<any>(() => admin.from('receipt_categories')
      .select('id, store_id, name, sort_order')
      .gte('sort_order', 0)
      .order('sort_order')),
    fetchAllPaged<any>(() => admin.from('receipt_vendors')
      .select('store_id, category_id, name, sort_order')
      .order('sort_order')),
    fetchAllPaged<any>(() => admin.from('item_column_mappings')
      .select('store_id, item_name, vendor_group, is_tax_addon')
      .order('sort_order')),
  ])

  const receiptHierarchy = buildReceiptStatisticsHierarchy(
    receiptCategories ?? [],
    receiptVendors ?? [],
    itemMappings ?? [],
  )

  const storeMap = Object.fromEntries(stores.map(store => [store.id, store.name]))
  const revenueByStore: Record<string, number> = {}
  for (const closing of monthClosings ?? []) {
    revenueByStore[closing.store_id] = (revenueByStore[closing.store_id] || 0) + Number(closing.total_revenue ?? 0)
  }

  // 央廚月營業額 = 本月各店叫貨收入 + 整月梁平退稅。
  const ckIds = stores.filter(store => store.type === '央廚').map(store => store.id)
  const ckRevenueByStore: Record<string, number> = {}
  const ckRefundByStore: Record<string, number> = {}
  const ckCostByStore: Record<string, number> = {}
  const ckDeliveryStoresByKitchen = new Map<string, Map<string, DeliveryStoreStat>>()
  const ckExpenseRows: { id: string; storeId: string; date: string; group: string; amount: number; note: string; items: string[] }[] = []
  if (ckIds.length > 0) {
    const [ckRecords, refundEntries] = await Promise.all([
      fetchAllPaged<any>(() => admin.from('ck_daily_records')
        .select('id, ck_store_id, business_date')
        .in('ck_store_id', ckIds)
        .gte('business_date', firstOfMonth).lte('business_date', selectedEnd)),
      Promise.all(ckIds.map(async ckId => {
        const { days } = await getCKRangeStats(ckId, firstOfMonth, selectedEnd)
        return [ckId, days.reduce((sum, day) => sum + day.taxRefund, 0)] as const
      })),
    ])
    for (const [ckId, refund] of refundEntries) ckRefundByStore[ckId] = refund
    const recordIds = (ckRecords ?? []).map(record => record.id)
    if (recordIds.length > 0) {
      const [ckOrders, ckExpenses] = await Promise.all([
        fetchAllPaged<any>(() => admin.from('ck_store_orders')
          .select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount')
          .in('ck_daily_record_id', recordIds)),
        fetchAllPaged<any>(() => admin.from('ck_expense_items')
          .select('id, ck_daily_record_id, vendor_group, item_name, amount, note')
          .in('ck_daily_record_id', recordIds)),
      ])
      const ckIdByRecord = new Map((ckRecords ?? []).map(record => [record.id as string, record.ck_store_id as string]))
      const ckDateByRecord = new Map((ckRecords ?? []).map(record => [record.id as string, String(record.business_date ?? '')]))
      for (const order of ckOrders ?? []) {
        const ckId = ckIdByRecord.get(order.ck_daily_record_id as string)
        if (!ckId) continue
        const externalStoreName = String(order.external_store_name ?? '').trim()
        const storeName = order.store_id
          ? (storeMap[order.store_id as string] || externalStoreName || '已移除店家')
          : (externalStoreName || '未指定店家')
        // 體系內店家已確認時採央廚確認金額；體系外店家則採央廚輸入金額。
        const amount = Number(order.store_id ? (order.ck_confirmed_amount ?? order.amount ?? 0) : (order.amount ?? 0))
        ckRevenueByStore[ckId] = (ckRevenueByStore[ckId] || 0) + amount
        const deliveries = ckDeliveryStoresByKitchen.get(ckId) ?? new Map<string, DeliveryStoreStat>()
        const row = deliveries.get(storeName) ?? { name: storeName, total: 0, count: 0 }
        row.total += amount
        if (amount !== 0) row.count += 1
        deliveries.set(storeName, row)
        ckDeliveryStoresByKitchen.set(ckId, deliveries)
      }
      for (const expense of ckExpenses ?? []) {
        const ckId = ckIdByRecord.get(expense.ck_daily_record_id as string)
        const amount = Number(expense.amount ?? 0)
        if (!ckId || amount <= 0) continue
        const group = String(expense.vendor_group ?? '').trim() || '未分類'
        const itemName = String(expense.item_name ?? '').trim()
        ckCostByStore[ckId] = (ckCostByStore[ckId] || 0) + amount
        ckExpenseRows.push({
          id: String(expense.id),
          storeId: ckId,
          date: ckDateByRecord.get(expense.ck_daily_record_id as string) ?? '',
          group,
          amount,
          note: String(expense.note ?? '').trim(),
          items: itemName ? [itemName] : [],
        })
      }
    }
    // 退稅只在月營業額加一次，不改動各店每日叫貨明細。
    for (const ckId of ckIds) {
      ckRevenueByStore[ckId] = (ckRevenueByStore[ckId] || 0) + (ckRefundByStore[ckId] || 0)
    }
  }

  type VendorGroupDraft = VendorStat & { vendorMap: Map<string, VendorDetail> }
  const vendorMap = new Map<string, VendorGroupDraft>()
  const costByStore: Record<string, number> = {}
  for (const receipt of monthReceipts ?? []) {
    const amount = Number(receipt.total_amount ?? 0)
    if (amount <= 0) continue
    const sourceGroup = receipt.vendor_name?.trim() || '未分類'
    const category = resolveReceiptStatisticsCategory(receiptHierarchy, receipt.store_id, sourceGroup)
    const actualVendor = resolveReportingActualVendor(
      storeMap[receipt.store_id],
      sourceGroup,
      receipt.actual_vendor_name,
      '',
    )
    const allocations = allocateReceiptStatistics(sourceGroup, amount, receipt.receipt_items)
    const key = `${receipt.store_id}|${category}|${sourceGroup}`
    const row: VendorGroupDraft = vendorMap.get(key) ?? {
      storeId: receipt.store_id,
      storeName: storeMap[receipt.store_id] ?? '未知店家',
      category,
      group: sourceGroup,
      total: 0,
      count: 0,
      vendors: [],
      details: [],
      vendorMap: new Map<string, VendorDetail>(),
    }
    row.total += amount
    row.count += 1
    if (actualVendor) {
      const detail = row.vendorMap.get(actualVendor) ?? {
        name: actualVendor,
        total: 0,
        count: 0,
        taxExemptRiceTotal: 0,
        taxExemptRiceCount: 0,
      }
      detail.total += amount
      detail.count += 1
      const riceAllocation = allocations.find(allocation => allocation.group === TAX_EXEMPT_RICE_GROUP)
      if (riceAllocation) {
        detail.taxExemptRiceTotal += riceAllocation.amount
        detail.taxExemptRiceCount += 1
      }
      row.vendorMap.set(actualVendor, detail)
    }
    row.details.push({
      id: String(receipt.id),
      date: String(receipt.business_date ?? ''),
      total: amount,
      actualVendor,
      note: String(receipt.notes ?? '').trim(),
      items: Array.from(new Set(allocations.flatMap(allocation => allocation.itemNames))),
    })
    vendorMap.set(key, row)
    costByStore[receipt.store_id] = (costByStore[receipt.store_id] || 0) + amount
  }
  // 央廚採購支出記在 ck_expense_items，不在店面收據表；補入同一份廠商明細。
  for (const expense of ckExpenseRows) {
    const category = resolveReceiptStatisticsCategory(receiptHierarchy, expense.storeId, expense.group)
    const key = `${expense.storeId}|${category}|${expense.group}`
    const row: VendorGroupDraft = vendorMap.get(key) ?? {
      storeId: expense.storeId,
      storeName: storeMap[expense.storeId] ?? '未知央廚',
      category,
      group: expense.group,
      total: 0,
      count: 0,
      vendors: [],
      details: [],
      vendorMap: new Map<string, VendorDetail>(),
    }
    row.total += expense.amount
    row.count += 1
    row.details.push({
      id: expense.id,
      date: expense.date,
      total: expense.amount,
      actualVendor: '',
      note: expense.note,
      items: expense.items,
    })
    vendorMap.set(key, row)
  }

  const vendorStats: VendorStat[] = [...vendorMap.values()]
    .map(({ vendorMap: _vendorMap, ...row }) => ({
      ...row,
      vendors: [..._vendorMap.values()].sort((a, b) => b.total - a.total),
      details: row.details.sort((a, b) => b.date.localeCompare(a.date) || b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)
  const categoriesByStore = new Map<string, ReceiptCategoryStat[]>()
  for (const vendor of vendorStats) {
    const categories = categoriesByStore.get(vendor.storeId) ?? []
    let category = categories.find(row => row.name === vendor.category)
    if (!category) {
      category = { name: vendor.category, total: 0, count: 0, groups: [] }
      categories.push(category)
    }
    category.total += vendor.total
    category.count += vendor.count
    category.groups.push(vendor)
    categoriesByStore.set(vendor.storeId, categories)
  }
  for (const [storeId, categories] of categoriesByStore) {
    for (const category of categories) {
      category.groups.sort((a, b) => b.total - a.total)
      category.count = new Set(category.groups.flatMap(group => group.details.map(detail => detail.id))).size
    }
    categories.sort((a, b) => {
      const orderDiff = receiptStatisticsCategoryOrder(receiptHierarchy, storeId, a.name)
        - receiptStatisticsCategoryOrder(receiptHierarchy, storeId, b.name)
      return orderDiff || b.total - a.total || a.name.localeCompare(b.name, 'zh-Hant')
    })
  }
  const storeStats: StoreSummary[] = stores.map(store => {
    const revenue = store.type === '央廚'
      ? (ckRevenueByStore[store.id] || 0)
      : (revenueByStore[store.id] || 0)
    const cost = store.type === '央廚'
      ? (ckCostByStore[store.id] || 0)
      : (costByStore[store.id] || 0)
    return {
      ...store,
      revenue,
      taxRefund: store.type === '央廚' ? (ckRefundByStore[store.id] || 0) : 0,
      cost,
      costRate: revenue > 0 ? (cost / revenue) * 100 : 0,
      receiptCategories: categoriesByStore.get(store.id) ?? [],
      deliveryStores: Array.from(ckDeliveryStoresByKitchen.get(store.id)?.values() ?? [])
        .filter(row => row.total !== 0)
        .sort((a, b) => b.total - a.total),
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const storeStatsOnly = storeStats.filter(store => store.type !== '央廚')
  const kitchenStatsOnly = storeStats.filter(store => store.type === '央廚')
  const storeRevenue = storeStatsOnly.reduce((sum, store) => sum + store.revenue, 0)
  const kitchenRevenue = kitchenStatsOnly.reduce((sum, store) => sum + store.revenue, 0)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <LayoutDashboard className="h-3.5 w-3.5" />總公司 · 統計中心
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>營運數據總覽</h1>
            <p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>集中查看本月各店業績與廠商叫貨支出</p>
          </div>
          <form method="get" className="flex items-center gap-2 flex-wrap justify-end">
            <label className="flex items-center gap-1.5 h-10 px-2.5 rounded-xl text-xs font-semibold" style={{ color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Calendar className="h-4 w-4" />
              <span className="sr-only">統計年份</span>
              <select name="year" defaultValue={year} className="bg-transparent outline-none font-bold cursor-pointer" aria-label="統計年份">
                {Array.from({ length: 6 }, (_, index) => todayYear - index).map(optionYear => <option key={optionYear} value={optionYear}>{optionYear} 年</option>)}
              </select>
            </label>
            <label className="h-10 px-2.5 rounded-xl flex items-center text-xs font-semibold" style={{ color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <span className="sr-only">統計月份</span>
              <select name="month" defaultValue={String(monthNumber)} className="bg-transparent outline-none font-bold cursor-pointer" aria-label="統計月份">
                {Array.from({ length: 12 }, (_, index) => index + 1).map(optionMonth => <option key={optionMonth} value={optionMonth}>{optionMonth} 月</option>)}
              </select>
            </label>
            <button type="submit" className="h-10 px-3 rounded-xl text-xs font-bold" style={{ background: '#F59E0B', color: 'white' }}>套用</button>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 pb-24 lg:pb-8">
        <div className="rounded-3xl p-6 sm:p-8 relative overflow-hidden text-white"
          style={{ background: 'linear-gradient(135deg,#18181b 0%,#92400E 60%,#FBBF24 100%)', boxShadow: '0 20px 50px -10px rgba(245,158,11,0.3)' }}>
          <div className="absolute rounded-full pointer-events-none" style={{ top: '-55%', right: '-8%', width: '420px', height: '420px', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent)' }} />
          <div className="flex items-center gap-2 text-sm mb-3 relative" style={{ opacity: 0.85 }}>
            <BarChart3 className="h-4 w-4" />{year} 年 {parseInt(month)} 月營運統計（統計至 {selectedEnd}）
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6 relative">
            <HeroMetric label="店面營業額" value={`$ ${fmt(storeRevenue)}`} />
            <HeroMetric label="央廚營業額" value={`$ ${fmt(kitchenRevenue)}`} />
          </div>
          <div className="flex gap-8 flex-wrap relative">
            <SummaryValue label="單據筆數" value={`${monthReceipts?.length ?? 0} 筆`} />
            <SummaryValue label="店面／央廚" value={`${storeStatsOnly.length} / ${kitchenStatsOnly.length} 家`} />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold mb-2 px-1" style={{ color: '#71717a' }}>營業額概覽</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard label="店面營業額" value={`$${fmt(storeRevenue)}`} sub={`${storeStatsOnly.length} 家店`} color="#d97706" />
              <MetricCard label="央廚營業額" value={`$${fmt(kitchenRevenue)}`} sub={`${kitchenStatsOnly.length} 家央廚`} color="#7c3aed" />
            </div>
          </div>
        </div>

        <StoreStatsSection
          icon={<Store className="h-4 w-4" />}
          title={`${parseInt(month)} 月店面營業額排名`}
          description="依本月營業額由高至低，從左至右、由上而下排列；點擊店家可展開明細"
          stores={storeStatsOnly}
          variant="store"
        />

        <StoreStatsSection
          icon={<ChefHat className="h-4 w-4" />}
          title={`${parseInt(month)} 月央廚營業額排名`}
          description="依本月營業額（叫貨收入＋梁平退稅）由高至低；點擊央廚可展開明細"
          stores={kitchenStatsOnly}
          variant="kitchen"
        />
      </div>
    </div>
  )
}

function StoreStatsSection({
  icon,
  title,
  description,
  stores,
  variant,
}: {
  icon: ReactNode
  title: string
  description: string
  stores: StoreSummary[]
  variant: 'store' | 'kitchen'
}) {
  const isKitchen = variant === 'kitchen'
  const rankingColumns = [stores.slice(0, 5), stores.slice(5)]
  return (
    <div className="bg-white rounded-2xl p-5 md:p-6" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <SectionTitle icon={icon} title={title} description={description} />
      {stores.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: '#a1a1aa' }}>目前沒有可顯示的{isKitchen ? '央廚' : '店面'}資料</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
          {rankingColumns.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-4">
              {column.map((store, index) => {
                const rank = columnIndex === 0 ? index + 1 : index + 6
                return <StoreStatsCard key={store.id} store={store} rank={rank} isKitchen={isKitchen} />
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StoreStatsCard({ store, rank, isKitchen }: { store: StoreSummary; rank: number; isKitchen: boolean }) {
  const deliveryRevenue = store.deliveryStores.reduce((sum, delivery) => sum + delivery.total, 0)
  const rankStyle = rank === 1
    ? { background: '#FEF3C7', color: '#92400E', border: '#F59E0B' }
    : rank === 2
    ? { background: '#F1F5F9', color: '#475569', border: '#CBD5E1' }
    : rank === 3
    ? { background: '#FFF7ED', color: '#9A3412', border: '#FDBA74' }
    : { background: '#FAFAFA', color: '#71717A', border: '#E4E4E7' }
  return (
    <details className="group rounded-2xl overflow-hidden" style={{ border: '1px solid #e4e4e7' }}>
      <summary className="list-none cursor-pointer select-none" style={{ background: isKitchen ? '#f5f3ff' : '#fffbeb' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-8 min-w-8 px-1.5 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold tabular-nums"
              style={{ background: rankStyle.background, color: rankStyle.color, border: `1px solid ${rankStyle.border}` }}
              aria-label={`第 ${rank} 名`}>第{rank}名</span>
            <div className="min-w-0">
              <p className="font-bold truncate" style={{ color: '#18181b' }}>{store.name}</p>
              <p className="text-[10px]" style={{ color: '#a1a1aa' }}>{isKitchen ? '央廚' : '店面'} · 點擊展開明細</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-base font-bold tabular-nums" style={{ color: '#92400E' }}>${fmt(store.revenue)}</span>
            <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" style={{ color: '#a1a1aa' }} />
          </div>
        </div>
      </summary>
      <div>
        <div className="grid grid-cols-3 gap-px" style={{ background: '#e4e4e7' }}>
          <SmallStat label={isKitchen ? '營業額（含退稅）' : '營業額'} value={`$${fmt(store.revenue)}`} />
          <SmallStat label="叫貨支出" value={`$${fmt(store.cost)}`} tone="orange" />
          <SmallStat
            label={isKitchen ? '叫貨店數／支出率' : '單據／支出率'}
            value={isKitchen
              ? `${store.deliveryStores.length} 家 · ${store.revenue ? store.costRate.toFixed(1) : '—'}%`
              : `${store.receiptCategories.reduce((sum, category) => sum + category.count, 0)} 筆 · ${store.revenue ? store.costRate.toFixed(1) : '—'}%`}
          />
        </div>
        <div className="p-3">
          {isKitchen && (
            <div className="mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid #ddd6fe', background: '#fafaff' }}>
              <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderBottom: '1px solid #e9e5ff' }}>
                <p className="text-xs font-bold" style={{ color: '#5b21b6' }}>各店叫貨統計</p>
                <p className="text-[11px] tabular-nums" style={{ color: '#7c3aed' }}>
                  {store.deliveryStores.length} 家 · 叫貨 ${fmt(deliveryRevenue)}{store.taxRefund ? ` · 退稅 +$${fmt(store.taxRefund)}` : ''}
                </p>
              </div>
              {store.deliveryStores.length === 0 ? (
                <p className="px-3 py-3 text-xs text-center" style={{ color: '#a1a1aa' }}>本月尚無店家叫貨紀錄</p>
              ) : (
                <div className="divide-y" style={{ borderColor: '#ede9fe' }}>
                  {store.deliveryStores.map(delivery => (
                    <div key={delivery.name} className="grid grid-cols-[1fr_56px_95px] gap-2 items-center px-3 py-2" style={{ background: 'white' }}>
                      <span className="text-sm font-semibold truncate" style={{ color: '#3f3f46' }}>{delivery.name}</span>
                      <span className="text-[11px] text-center tabular-nums" style={{ color: '#a1a1aa' }}>{delivery.count} 筆</span>
                      <span className="text-sm text-right font-bold tabular-nums" style={{ color: '#6d28d9' }}>${fmt(delivery.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {store.receiptCategories.length === 0 ? <p className="text-xs text-center py-3" style={{ color: '#a1a1aa' }}>{isKitchen ? '本月尚無央廚採購支出' : '本月尚無廠商叫貨'}</p> : <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 px-1 pb-0.5">
              <p className="text-xs font-semibold" style={{ color: '#71717a' }}>{isKitchen ? '央廚採購／支出明細' : '依收據管理分類'}</p>
              <p className="text-[10px]" style={{ color: '#a1a1aa' }}>大類別 → 子類別 → 每筆備註</p>
            </div>
            {store.receiptCategories.map(category => (
              <div key={`${store.id}-${category.name}`} className="rounded-xl overflow-hidden"
                style={{ background: '#f8fafc', border: `1px solid ${category.name === '未分類' ? '#fecaca' : '#e2e8f0'}` }}>
                <div className="grid grid-cols-[1fr_55px_95px] gap-2 items-center px-3 py-2.5"
                  style={{ background: category.name === '未分類' ? '#fff7ed' : '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                  <span className="text-sm font-bold truncate" style={{ color: category.name === '未分類' ? '#9a3412' : '#334155' }}>
                    {category.name === '未分類' ? '未分類（收據管理尚未設定）' : category.name}
                  </span>
                  <span className="text-xs text-center tabular-nums" style={{ color: '#94a3b8' }}>{category.count} 筆</span>
                  <span className="text-sm text-right font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(category.total)}</span>
                </div>
                <div className="space-y-1.5 p-2">
                  {category.groups.map(group => (
                    <div key={`${group.storeId}-${category.name}-${group.group}`} className="rounded-lg overflow-hidden" style={{ background: 'white', border: '1px solid #f1f5f9' }}>
                      <div className="grid grid-cols-[1fr_55px_95px] gap-2 items-center px-2.5 py-2">
                        <span className="text-sm font-semibold truncate" style={{ color: '#52525b' }}>↳ {group.group}</span>
                        <span className="text-xs text-center tabular-nums" style={{ color: '#a1a1aa' }}>{group.count} 筆</span>
                        <span className="text-sm text-right font-bold tabular-nums" style={{ color: '#c2410c' }}>${fmt(group.total)}</span>
                      </div>
                      {group.vendors.length > 0 && <div className="mx-2 mb-2 ml-5 space-y-1 pl-2.5" style={{ borderLeft: '2px solid #fed7aa' }}>
                        {group.vendors.map(actual => <div key={actual.name} className="overflow-hidden rounded-md" style={{ background: '#fffbeb' }}>
                          <div className="grid grid-cols-[1fr_55px_95px] gap-2 items-center px-2 py-1.5">
                            <span className="text-xs truncate" style={{ color: '#71717a' }}>• {actual.name}</span>
                            <span className="text-[11px] text-center tabular-nums" style={{ color: '#a1a1aa' }}>{actual.count} 筆</span>
                            <span className="text-xs text-right font-semibold tabular-nums" style={{ color: '#c2410c' }}>${fmt(actual.total)}</span>
                          </div>
                          {actual.taxExemptRiceTotal !== 0 && <div className="grid grid-cols-[1fr_55px_95px] gap-2 items-center mx-2 mb-1.5 px-2 py-1.5 rounded-md" style={{ background: '#fff7ed', borderLeft: '2px solid #fdba74' }}>
                            <span className="text-[11px] truncate" style={{ color: '#9a3412' }}>↳ {TAX_EXEMPT_RICE_GROUP}</span>
                            <span className="text-[10px] text-center tabular-nums" style={{ color: '#a1a1aa' }}>{actual.taxExemptRiceCount} 筆</span>
                            <span className="text-[11px] text-right font-semibold tabular-nums" style={{ color: '#c2410c' }}>${fmt(actual.taxExemptRiceTotal)}</span>
                          </div>}
                        </div>)}
                      </div>}
                      <details className="group/receipts mx-2 mb-2 overflow-hidden rounded-lg" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <summary className="list-none cursor-pointer select-none px-3 py-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold" style={{ color: '#475569' }}>查看每筆購買內容與備註</span>
                          <span className="text-[11px] shrink-0" style={{ color: '#ea580c' }}>{group.details.length} 筆＋</span>
                        </summary>
                        <div className="space-y-2 p-2 pt-0" style={{ borderTop: '1px solid #e2e8f0' }}>
                          {group.details.map(detail => (
                            <div key={detail.id} className="rounded-lg p-2.5" style={{ background: 'white', border: '1px solid #f1f5f9' }}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#64748b' }}>{detail.date || '日期未填'}</span>
                                <span className="text-sm font-extrabold tabular-nums" style={{ color: '#c2410c' }}>${fmt(detail.total)}</span>
                              </div>
                              <div className="mt-2 grid gap-1 text-xs leading-relaxed">
                                {detail.actualVendor && (
                                  <p style={{ color: '#52525b' }}><span className="font-semibold" style={{ color: '#334155' }}>實際廠商：</span>{detail.actualVendor}</p>
                                )}
                                <p style={{ color: '#52525b' }}><span className="font-semibold" style={{ color: '#334155' }}>購買品項：</span>{detail.items.length > 0 ? detail.items.join('、') : '未填品項'}</p>
                                <p className="whitespace-pre-wrap break-words" style={{ color: detail.note ? '#18181b' : '#a1a1aa' }}>
                                  <span className="font-semibold" style={{ color: '#334155' }}>備註：</span>{detail.note || '未填備註'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </details>
  )
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl px-4 py-3 relative" style={{ background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.16)' }}>
    <p className="text-sm mb-1" style={{ opacity: 0.78 }}>{label}</p>
    <p className="font-extrabold tabular-nums leading-none" style={{ fontSize: 'clamp(30px,4vw,46px)', letterSpacing: '-0.03em' }}>{value}</p>
  </div>
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs mb-1" style={{ opacity: 0.7 }}>{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div>
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return <div className="bg-white rounded-2xl p-5 relative overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><div className="absolute left-0 top-0 w-1 h-full rounded-l-2xl" style={{ background: color }} /><p className="text-xs font-medium mb-2 pl-2" style={{ color: '#71717a' }}>{label}</p><p className="text-2xl sm:text-3xl font-bold tabular-nums pl-2" style={{ color: '#18181b' }}>{value}</p><p className="text-xs font-semibold mt-1.5 pl-2" style={{ color: '#a1a1aa' }}>{sub}</p></div>
}

function SmallStat({ label, value, tone }: { label: string; value: string; tone?: 'orange' }) {
  return <div className="bg-white px-3 py-2.5 min-w-0"><p className="text-[10px] truncate" style={{ color: '#a1a1aa' }}>{label}</p><p className="text-sm font-bold tabular-nums truncate" style={{ color: tone === 'orange' ? '#c2410c' : '#18181b' }}>{value}</p></div>
}

function SectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex items-start gap-2.5"><span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FFFBEB', color: '#92400E' }}>{icon}</span><div><h2 className="text-base font-semibold" style={{ color: '#18181b' }}>{title}</h2><p className="text-xs mt-1" style={{ color: '#a1a1aa' }}>{description}</p></div></div>
}
