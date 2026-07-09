'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'

export interface MonthlyStats {
  revenue: number
  posTotal: number
  ck: number
  food: number
  pack: number
  misc: number
  totalCost: number
  vendorBreakdown: Array<{ vendor_group: string; doc_type: string; food: number; pack: number; misc: number }>
}

/**
 * 以「食耗成本 Excel 匯出」為主邏輯的月度統計。
 * 邏輯必須跟 app/api/export/food-cost/route.ts 對齊：
 * - categoryLookup 從 item_column_mappings（各店專屬）
 * - storeColumns 從 storage `{storeId}-columns.json`，fallback EXCEL_COLUMNS
 * - Receipts.items + Closings.order_items 都加總
 * - Tax 分流：受影響品項含耗材 → 加到 pack；否則 → 加到 misc
 */
export async function getMonthlyStats(storeId: string, year: number, monthNum: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  if (!storeId || !year || !monthNum) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  const [{ data: receipts }, { data: closings }, { data: storeRow }, { data: mappingsRaw }, { data: ckPricesData }] = await Promise.all([
    admin.from('receipts')
      .select('business_date, tax_amount, receipt_type, receipt_items(item_name, excel_column, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('daily_closings')
      .select('business_date, status, updated_at, total_revenue, total_cost, revenue_items(channel, gross_amount), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('stores').select('name').eq('id', storeId).single(),
    admin.from('item_column_mappings')
      .select('item_name, excel_column, item_category, vendor_group, store_id')
      .eq('store_id', storeId),
    admin.from('central_kitchen_prices').select('item_name, excel_column').eq('active', true),
  ])

  // Build lookups from store-specific mappings only.
  const mappingLookup: Record<string, string> = {}
  const categoryLookup: Record<string, string> = {}
  const vendorGroupLookup: Record<string, string> = {}
  for (const m of (mappingsRaw ?? []) as any[]) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
    if (m.vendor_group) { vendorGroupLookup[m.item_name] = m.vendor_group; vendorGroupLookup[m.excel_column] = m.vendor_group }
  }

  // CK item_name → excel_column
  const ckColLookup: Record<string, string> = {}
  for (const p of (ckPricesData ?? []) as any[]) {
    ckColLookup[p.item_name] = p.excel_column || p.item_name
  }

  // storeColumns 從 storage 拿；fallback 到預設
  let storeColumns = EXCEL_COLUMNS
  try {
    const { data: colFile } = await admin.storage.from('excel-templates').download(`${storeId}-columns.json`)
    if (colFile) {
      const parsed = JSON.parse(await colFile.text())
      if (parsed['食材']?.length && parsed['耗材']?.length && parsed['雜項']?.length) {
        storeColumns = parsed
      }
    }
  } catch { /* fallback */ }

  const foodCols = new Set(storeColumns['食材'])
  const packCols = new Set(storeColumns['耗材'])
  const miscCols = new Set(storeColumns['雜項'])

  function categoryOf(itemName: string, resolvedCol: string): '食材' | '耗材' | '雜項' | null {
    const c = categoryLookup[itemName]
    if (c === '食材' || c === '耗材' || c === '雜項') return c
    if (foodCols.has(resolvedCol)) return '食材'
    if (packCols.has(resolvedCol)) return '耗材'
    if (miscCols.has(resolvedCol)) return '雜項'
    return null
  }

  // resolver 取 doc_type / vendor_group 顯示名（vendorBreakdown 用）
  const resolved = await getStoreItemsFromMappings(storeId)
  const docTypeByName: Record<string, string> = {}
  const vgNameByName: Record<string, string> = {}
  for (const r of resolved) {
    docTypeByName[r.name] = r.doc_type ?? ''
    vgNameByName[r.name] = r.vendor_group
  }

  let food = 0, pack = 0, misc = 0
  const vendorMap: Record<string, { vendor_group: string; doc_type: string; food: number; pack: number; misc: number }> = {}

  function addToVendor(vg: string, doc: string, cat: '食材' | '耗材' | '雜項', amt: number) {
    const key = `${vg}||${doc}`
    const entry = vendorMap[key] ?? { vendor_group: vg, doc_type: doc, food: 0, pack: 0, misc: 0 }
    if (cat === '食材') entry.food += amt
    else if (cat === '耗材') entry.pack += amt
    else entry.misc += amt
    vendorMap[key] = entry
  }

  // ─── Receipts ─────────────────────────────────────────
  for (const r of (receipts ?? []) as any[]) {
    for (const it of (r.receipt_items ?? [])) {
      const amt = (it.amount ?? 0) as number
      if (!amt) continue
      const resolvedCol = mappingLookup[it.item_name] ?? it.excel_column ?? ''
      const cat = categoryOf(it.item_name, resolvedCol)
      if (!cat) continue
      if (cat === '食材') food += amt
      else if (cat === '耗材') pack += amt
      else misc += amt

      const vg = vendorGroupLookup[it.item_name] ?? vgNameByName[it.item_name] ?? '其他'
      const doc = docTypeByName[it.item_name] || (r.receipt_type === 'invoice' ? '發票' : r.receipt_type === 'receipt' ? '收據' : '')
      addToVendor(vg, doc, cat, amt)
    }
    // Tax 分流
    const taxAmt = (r.tax_amount ?? 0) as number
    if (taxAmt > 0) {
      const items = (r.receipt_items ?? []) as any[]
      const hasPack = items.some((it: any) => {
        const rc = mappingLookup[it.item_name] ?? it.excel_column
        return categoryLookup[it.item_name] === '耗材' || packCols.has(rc)
      })
      if (hasPack) {
        pack += taxAmt
        // 稅金歸「免洗稅金」欄不放進 vendorBreakdown（不歸廠商）
      } else {
        misc += taxAmt
      }
    }
  }

  // ─── Closings ─────────────────────────────────────────
  // 同日多筆 → 取 status 優先高的
  const STATUS_PRIORITY: Record<string, number> = { verified: 4, submitted: 3, disputed: 2, draft: 1 }
  const byDate: Record<string, any[]> = {}
  for (const c of (closings ?? []) as any[]) {
    if (!byDate[c.business_date]) byDate[c.business_date] = []
    byDate[c.business_date].push(c)
  }
  let revenue = 0, posTotal = 0, ck = 0
  for (const arr of Object.values(byDate)) {
    const best = arr.sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0))[0]
    revenue += best.total_revenue ?? 0
    for (const rv of (best.revenue_items ?? [])) {
      if (rv.channel === 'pos') posTotal += rv.gross_amount ?? 0
    }
    // CK order_items — 央廚配送 summary 優先；其他 CK 分項算進食/耗/雜
    let ckSummarySum = 0, ckItemsSum = 0
    for (const oi of (best.order_items ?? [])) {
      if (oi.item_name === '央廚配送') {
        ckSummarySum += oi.total_amount ?? 0
      } else {
        const excelCol = mappingLookup[oi.item_name] ?? ckColLookup[oi.item_name] ?? oi.item_name
        const cat = categoryOf(oi.item_name, excelCol)
        if (cat && (oi.total_amount ?? 0) > 0) {
          const amt = oi.total_amount as number
          if (cat === '食材') food += amt
          else if (cat === '耗材') pack += amt
          else misc += amt
          const vg = vendorGroupLookup[oi.item_name] ?? vgNameByName[oi.item_name] ?? '央廚配送'
          const doc = docTypeByName[oi.item_name] ?? ''
          addToVendor(vg, doc, cat, amt)
        }
        if (oi.item_name in ckColLookup) ckItemsSum += oi.total_amount ?? 0
      }
    }
    ck += ckSummarySum > 0 ? ckSummarySum : ckItemsSum
  }

  const stats: MonthlyStats = {
    revenue, posTotal, ck,
    food, pack, misc,
    totalCost: food + pack + misc,
    vendorBreakdown: Object.values(vendorMap)
      .filter(v => v.food + v.pack + v.misc !== 0)
      .sort((a, b) => a.vendor_group.localeCompare(b.vendor_group) || a.doc_type.localeCompare(b.doc_type)),
  }

  return { success: true as const, stats, storeName: storeRow?.name ?? '' }
}
