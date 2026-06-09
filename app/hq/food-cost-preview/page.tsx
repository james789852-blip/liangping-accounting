import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FileBarChart2 } from 'lucide-react'
import FoodCostPreviewClient from '@/components/hq/food-cost-preview-client'

export const dynamic = 'force-dynamic'

export default async function FoodCostPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; month?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('stores').select('id, name').eq('active', true).order('name')

  const params = await searchParams
  const storeId = params.storeId ?? stores?.[0]?.id ?? ''
  const now = new Date()
  const month = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  if (!storeId) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <p className="text-sm" style={{ color: '#a1a1aa' }}>尚無店家資料</p>
      </div>
    )
  }

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay = new Date(year, monthNum, 0).toISOString().slice(0, 10)

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
    admin.from('item_column_mappings').select('item_name, excel_column, item_category').order('item_name'),
    admin.from('daily_closings')
      .select('business_date, total_revenue')
      .eq('store_id', storeId)
      .gte('business_date', firstDay)
      .lte('business_date', lastDay),
  ])

  const mappingMap: Record<string, { excel_column: string; item_category: string }> = {}
  for (const m of mappings ?? []) {
    mappingMap[m.item_name] = { excel_column: m.excel_column, item_category: m.item_category }
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
    mappedItems: { vendor: string; item_name: string; excel_column: string; category: string; amount: number }[]
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

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-4 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileBarChart2 className="h-3.5 w-3.5" />食耗成本預覽
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>食耗成本自動整理</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            店長填入收據細項後，系統自動對應到 Excel 欄位，不需手動輸入
          </p>
        </div>
      </div>

      <FoodCostPreviewClient
        stores={stores ?? []}
        storeId={storeId}
        month={month}
        rows={rows}
        totalMapped={totalMapped}
        totalUnmapped={totalUnmapped}
        mappingCount={(mappings ?? []).length}
      />
    </div>
  )
}
