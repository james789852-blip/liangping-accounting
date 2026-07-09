import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FileBarChart2 } from 'lucide-react'
import FoodCostPreviewClient from '@/components/hq/food-cost-preview-client'
import CKTemplateClient from '@/components/hq/ck-template-client'
import { getMonthLastDay } from '@/lib/business-date'
import { sortStores } from '@/lib/store-order'
import { resolveHQStoreId } from '@/lib/hq-store-selection'

export const dynamic = 'force-dynamic'

export default async function FoodCostPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; month?: string; type?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const params = await searchParams
  const isCK = params.type === 'ck'

  // 店面模式已整合到 /hq/store-overview；只保留央廚模板管理
  if (!isCK) redirect('/hq/store-overview')

  // 央廚模式：只撈央廚店家；店面模式：排除央廚
  const { data: storesRaw } = await admin
    .from('stores').select('id, name, type').eq('active', true)
    .filter('type', isCK ? 'eq' : 'neq', '央廚')
  const stores = sortStores(storesRaw ?? [])

  const storeId = await resolveHQStoreId(stores, params.storeId)
  const now = new Date()
  const month = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  if (!storeId) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <p className="text-sm" style={{ color: '#a1a1aa' }}>{isCK ? '尚無央廚店家' : '尚無店家資料'}</p>
      </div>
    )
  }

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  // ─── 央廚模式：撈 ck_daily_records 系列資料 ───────────────────────────
  if (isCK) {
    const [{ data: records }, { data: ckStore }, tmplCheck, tmplMetaRes] = await Promise.all([
      admin.from('ck_daily_records').select('id, business_date').eq('ck_store_id', storeId).gte('business_date', firstDay).lte('business_date', lastDay),
      admin.from('stores').select('assigned_store_ids').eq('id', storeId).maybeSingle(),
      admin.storage.from('excel-templates').list('', { search: `ck-${storeId}` }),
      admin.storage.from('excel-templates').download(`ck-${storeId}-meta.json`).then(r => r.data).catch(() => null),
    ])
    const assignedIds: string[] = ((ckStore as any)?.assigned_store_ids as string[] | null) ?? []
    const recordIds = (records ?? []).map(r => r.id)
    const [{ data: storeOrders }, { data: expenseItems }] = await Promise.all([
      recordIds.length > 0
        ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, amount, ck_confirmed_amount').in('ck_daily_record_id', recordIds)
        : Promise.resolve({ data: [] }),
      recordIds.length > 0
        ? admin.from('ck_expense_items').select('ck_daily_record_id, category, amount').in('ck_daily_record_id', recordIds)
        : Promise.resolve({ data: [] }),
    ])

    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
    const daysInMonth = new Date(year, monthNum, 0).getDate()
    const days = Array.from({ length: daysInMonth }, (_, i) =>
      `${month}-${String(i + 1).padStart(2, '0')}`
    )
    const byDate: Record<string, { revenueTotal: number; expenseTotal: number; foodTotal: number; packTotal: number; miscTotal: number }> = {}
    for (const date of days) byDate[date] = { revenueTotal: 0, expenseTotal: 0, foodTotal: 0, packTotal: 0, miscTotal: 0 }

    // 預先 group by ck_daily_record_id 避免 O(N×M)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordersByRecord: Record<string, any[]> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (storeOrders ?? []) as any[]) {
      const k = o.ck_daily_record_id as string
      if (!ordersByRecord[k]) ordersByRecord[k] = []
      ordersByRecord[k].push(o)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expsByRecord: Record<string, any[]> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (expenseItems ?? []) as any[]) {
      const k = e.ck_daily_record_id as string
      if (!expsByRecord[k]) expsByRecord[k] = []
      expsByRecord[k].push(e)
    }

    for (const record of records ?? []) {
      const date = record.business_date as string
      const row = byDate[date]
      if (!row) continue
      for (const o of (ordersByRecord[record.id as string] ?? [])) {
        row.revenueTotal += o.store_id
          ? Number(o.ck_confirmed_amount ?? 0)
          : Number(o.amount ?? 0)
      }
      for (const e of (expsByRecord[record.id as string] ?? [])) {
        const amt = (e.amount as number) ?? 0
        const cat = e.category as string
        row.expenseTotal += amt
        if (cat === '食材') row.foodTotal += amt
        else if (cat === '耗材') row.packTotal += amt
        else row.miscTotal += amt
      }
    }

    const ckRows = days.map(d => {
      const dt = new Date(d + 'T12:00:00+08:00')
      return { date: d, weekday: `星期${WEEKDAYS[dt.getDay()]}`, ...byDate[d] }
    })
    const monthTotals = ckRows.reduce(
      (s, r) => ({ revenue: s.revenue + r.revenueTotal, expense: s.expense + r.expenseTotal, food: s.food + r.foodTotal, pack: s.pack + r.packTotal, misc: s.misc + r.miscTotal }),
      { revenue: 0, expense: 0, food: 0, pack: 0, misc: 0 },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasTemplate = (tmplCheck.data ?? []).some((f: any) => f.name === `ck-${storeId}.xlsx`)
    let templateMeta: { filename: string; uploadedAt: string } | null = null
    if (tmplMetaRes) {
      try { templateMeta = JSON.parse(await tmplMetaRes.text()) } catch {}
    }

    return (
      <div className="min-h-full" style={{ background: '#fafafa' }}>
        <div className="bg-white px-4 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <FileBarChart2 className="h-3.5 w-3.5" />模板設定 · 央廚
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>央廚 Excel 模板設定</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
              上傳央廚 Excel 模板；匯出與「同步試算表」都會自動套用
            </p>
          </div>
        </div>
        <CKTemplateClient
          stores={stores}
          storeId={storeId}
          month={month}
          rows={ckRows}
          hasTemplate={hasTemplate}
          templateMeta={templateMeta}
          monthTotals={monthTotals}
        />
      </div>
    )
  }

  const [
    { data: receipts },
    { data: mappings },
    { data: closings },
  ] = await Promise.all([
    admin.from('receipts')
      .select('id, business_date, vendor_name, receipt_type, total_amount, receipt_items(item_name, unit, quantity, unit_price, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay)
      .lte('business_date', lastDay)
      .order('business_date'),
    admin.from('item_column_mappings')
      .select('id, item_name, excel_column, item_category, vendor_group, store_id')
      .eq('store_id', storeId),
    admin.from('daily_closings')
      .select('business_date, total_revenue')
      .eq('store_id', storeId)
      .gte('business_date', firstDay)
      .lte('business_date', lastDay),
  ])

  let hasTemplate = false
  let templateColumns: Record<string, string[]> | null = null
  let templateMeta: { filename: string; uploadedAt: string } | null = null
  try {
    const { data: tmplFiles } = await admin.storage.from('excel-templates').list('', { search: storeId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasTemplate = (tmplFiles ?? []).some((f: any) => f.name === `${storeId}.xlsx`)
    const [colFileRes, metaFileRes] = await Promise.allSettled([
      admin.storage.from('excel-templates').download(`${storeId}-columns.json`),
      admin.storage.from('excel-templates').download(`${storeId}-meta.json`),
    ])
    if (colFileRes.status === 'fulfilled' && colFileRes.value.data) {
      const parsed = JSON.parse(await colFileRes.value.data.text())
      if (Array.isArray(parsed['食材']) && Array.isArray(parsed['耗材']) && Array.isArray(parsed['雜項'])) {
        templateColumns = parsed
      }
    }
    if (metaFileRes.status === 'fulfilled' && metaFileRes.value.data) {
      templateMeta = JSON.parse(await metaFileRes.value.data.text())
    }
  } catch { /* storage unavailable, features degrade gracefully */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // 單次 pass 同時做 storeMappings 收集與 mappingMap 建構（原本 3 次 filter）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeMappings: { id: string; item_name: string; excel_column: string; item_category: string; vendor_group: string | null }[] = []
  const mappingMap: Record<string, { excel_column: string; item_category: string; vendor_group: string | null }> = {}
  for (const m of (mappings ?? []) as any[]) {
    const entry = { excel_column: m.excel_column, item_category: m.item_category, vendor_group: m.vendor_group ?? null }
    mappingMap[m.item_name] = entry
    storeMappings.push({ id: m.id as string, item_name: m.item_name as string, ...entry })
  }

  const revenueMap: Record<string, number> = {}
  for (const c of closings ?? []) {
    revenueMap[c.business_date] = c.total_revenue ?? 0
  }

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )

  interface DayRow {
    date: string
    weekday: string
    revenue: number
    foodTotal: number
    packTotal: number
    miscTotal: number
    grandTotal: number
    mappedItems: { vendor: string; item_name: string; excel_column: string; category: string; vendor_group: string | null; amount: number }[]
    unmappedItems: { vendor: string; item_name: string; amount: number }[]
    receiptCount: number
  }

  const byDate: Record<string, DayRow> = {}
  for (const date of days) {
    const dt = new Date(date + 'T12:00:00+08:00')
    byDate[date] = {
      date,
      weekday: `星期${WEEKDAYS[dt.getDay()]}`,
      revenue: revenueMap[date] ?? 0,
      foodTotal: 0, packTotal: 0, miscTotal: 0, grandTotal: 0,
      mappedItems: [], unmappedItems: [], receiptCount: 0,
    }
  }

  for (const r of (receipts ?? []) as any[]) {
    const row = byDate[r.business_date]
    if (!row) continue
    row.receiptCount++
    for (const it of (r.receipt_items ?? []) as any[]) {
      if (!it.item_name?.trim() || !(it.amount > 0)) continue
      const mapping = mappingMap[it.item_name]
      if (mapping) {
        row.mappedItems.push({
          vendor: r.vendor_name ?? '',
          item_name: it.item_name,
          excel_column: mapping.excel_column,
          category: mapping.item_category,
          vendor_group: mapping.vendor_group,
          amount: it.amount,
        })
        if (mapping.item_category === '食材') row.foodTotal += it.amount
        else if (mapping.item_category === '耗材') row.packTotal += it.amount
        else if (mapping.item_category === '雜項') row.miscTotal += it.amount
      } else if (it.item_name?.trim()) {
        row.unmappedItems.push({
          vendor: r.vendor_name ?? '',
          item_name: it.item_name,
          amount: it.amount,
        })
      }
    }
    row.grandTotal = row.foodTotal + row.packTotal + row.miscTotal
  }

  const rows = days.map(d => byDate[d])

  const totalMapped = rows.reduce((s, r) => s + r.mappedItems.length, 0)
  const totalUnmapped = rows.reduce((s, r) => s + r.unmappedItems.length, 0)

  const colBreakdownMap: Record<string, { category: string; vendor_group: string | null; total: number }> = {}
  for (const row of rows) {
    for (const item of row.mappedItems) {
      if (!colBreakdownMap[item.excel_column]) {
        colBreakdownMap[item.excel_column] = { category: item.category, vendor_group: item.vendor_group, total: 0 }
      }
      colBreakdownMap[item.excel_column].total += item.amount
    }
  }
  const colBreakdown = Object.entries(colBreakdownMap)
    .filter(([, v]) => v.total > 0)
    .map(([col, v]) => ({ col, category: v.category, vendor_group: v.vendor_group, total: v.total }))
    .sort((a, b) => (a.vendor_group || a.category).localeCompare(b.vendor_group || b.category) || b.total - a.total)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-4 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileBarChart2 className="h-3.5 w-3.5" />模板設定 · 店面
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>店面 Excel 模板設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            店長填入收據細項後，系統依品項對應自動寫入 Excel 欄位
          </p>
        </div>
      </div>

      <FoodCostPreviewClient
        stores={stores}
        storeId={storeId}
        month={month}
        rows={rows}
        totalMapped={totalMapped}
        totalUnmapped={totalUnmapped}
        mappingCount={(mappings ?? []).length}
        colBreakdown={colBreakdown}
        hasTemplate={hasTemplate}
        templateColumns={templateColumns}
        templateMeta={templateMeta}
        storeMappings={storeMappings}
      />
    </div>
  )
}
