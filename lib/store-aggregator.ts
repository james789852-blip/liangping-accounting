/**
 * 統一店家資料聚合器
 *
 * 一份計算邏輯，取代散落在 food-cost/route、closing-native/route、
 * monthly-stats、food-cost-preview page 各處的重複實作。
 *
 * 資料來源：
 *   daily_closings + revenue_items + order_items (每日結帳)
 *   receipts + receipt_items (收據明細)
 *   system_vendor_groups + system_items + store_items (資料 schema)
 *
 * 對齊使用者原本 Excel「食耗成本」sheet 的欄位邏輯。
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getMonthLastDay } from '@/lib/business-date'
import { getStoreItemsResolved, type ResolvedStoreItem } from '@/lib/store-items-resolver'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface StoreInfo {
  id: string
  name: string
  ichef_uber_linked?: boolean
  uber_enabled?: boolean
  uber_accounts?: string[]
  panda_enabled?: boolean
  twpay_enabled?: boolean
  online_enabled?: boolean
  online_cash_enabled?: boolean
}

/** 一日各項數字 */
export interface DailyStats {
  date: string           // YYYY-MM-DD
  weekday: string        // 星期X
  pos: number            // (手動)POS
  twpay: number
  panda: number
  online: number
  online_cash: number
  uber: Record<string, number>       // account_name → amount
  handwrite: Record<string, number>  // handwrite account (鑫營/五分舖等) → amount
  handwriteTotal: number             // 手寫合計
  // ── 計算欄 ──
  actual: number         // (手動)實際$（DB actual_remit）
  ck: number             // 配送(月底結)（DB total_cost）
  onsite: number         // 現場 = 純現場交易金額
  variance: number       // 結果 = 實際 - 現場 - 配送
  after_deduct: number   // 扣除後的$ = 實際 - 配送 - 結果
  revenue: number        // 營業額 = 現場 + 結果
  totalRevenue: number   // DB 記錄的 total_revenue（含所有 channel）
  // ── 成本 by category ──
  food: number
  pack: number
  misc: number
  totalCost: number
  // ── 依單據類型（doc_type）當日加總 ──
  invoiceTotal: number   // doc_type=發票 品項加總（食+耗+雜）
  receiptTotal: number   // doc_type=收據 品項加總
  estimateTotal: number  // doc_type=估價單 品項加總
  taxRefund: number      // 梁平退稅：doc_type=發票 且 vendor_group 含「退稅」
  // ── 品項明細 (item_name → amount) 對應到啟用品項 ──
  items: Record<string, number>
  // ── 廠商群組小計 (vg_name → doc_type → amount) ──
  vendorGroupBreakdown: Record<string, Record<string, number>>
  // ── 收據原始資料 ──
  receipts: Array<{
    vendor_name: string
    total_amount: number
    tax_amount: number
    notes: string | null
    receipt_type: string | null
    items: Array<{ item_name: string; amount: number }>
  }>
  // ── 該日結帳狀態 ──
  closingStatus: 'draft' | 'submitted' | 'verified' | 'disputed' | 'none'
}

/** 月度合計 */
export interface MonthlyStats {
  year: number
  monthNum: number
  storeName: string
  daily: DailyStats[]
  totals: DailyStats  // 每欄的月合計（date/weekday 為空）
  // ── 品項月合計（含 vendor_group + doc_type + item_name） ──
  itemMonthlyTotals: Array<{
    vendor_group: string
    vendor_group_sort_order: number
    doc_type: string
    item_name: string
    category: '食材' | '耗材' | '雜項'
    total: number
  }>
  // ── 特殊統計欄 ──
  totalInvoice: number     // 所有 doc_type=發票 加總
  totalReceipt: number     // 所有 doc_type=收據 加總
  liangpingRefund: number  // 梁平退稅 = 發票+退稅（doc_type=發票 且 vg=退稅 or 稅金）
}

function newEmptyDay(date: string): DailyStats {
  const dt = new Date(date + 'T12:00:00+08:00')
  return {
    date,
    weekday: `星期${WEEKDAYS[dt.getDay()]}`,
    pos: 0, twpay: 0, panda: 0, online: 0, online_cash: 0,
    uber: {}, handwrite: {}, handwriteTotal: 0,
    actual: 0, ck: 0, onsite: 0, variance: 0, after_deduct: 0,
    revenue: 0, totalRevenue: 0,
    food: 0, pack: 0, misc: 0, totalCost: 0,
    invoiceTotal: 0, receiptTotal: 0, estimateTotal: 0, taxRefund: 0,
    items: {}, vendorGroupBreakdown: {}, receipts: [],
    closingStatus: 'none',
  }
}

/** 一天內同 date 多筆 closings → 依 status 優先序取最新 */
const STATUS_PRIORITY: Record<string, number> = { verified: 4, submitted: 3, disputed: 2, draft: 1 }

/**
 * 拿一段日期範圍的 daily stats（含店家 flag、品項 metadata、計算好的所有欄位）
 * @param storeId
 * @param firstDay YYYY-MM-DD
 * @param lastDay  YYYY-MM-DD
 */
export async function getRangeStats(
  storeId: string,
  firstDay: string,
  lastDay: string,
): Promise<{ store: StoreInfo; items: ResolvedStoreItem[]; days: DailyStats[] }> {
  const admin = createAdminClient()
  const [{ data: storeRow }, resolved, { data: closings }, { data: receipts }] = await Promise.all([
    admin.from('stores')
      .select('id, name, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, online_cash_enabled')
      .eq('id', storeId).single(),
    getStoreItemsResolved(storeId),
    admin.from('daily_closings')
      .select('business_date, status, updated_at, actual_remit, total_revenue, total_cost, revenue_items(channel, account_name, gross_amount), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay)
      .order('updated_at', { ascending: true }),
    admin.from('receipts')
      .select('business_date, vendor_name, total_amount, tax_amount, notes, receipt_type, receipt_items(item_name, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
  ])
  const store = (storeRow ?? { id: storeId, name: '' }) as StoreInfo
  const items = resolved
  const itemMeta = new Map(items.map(i => [i.name, i] as const))

  // 建 date map，同日多筆 closings 取 status 優先高
  const closingsByDate: Record<string, any[]> = {}
  for (const c of (closings ?? []) as any[]) {
    if (!closingsByDate[c.business_date]) closingsByDate[c.business_date] = []
    closingsByDate[c.business_date].push(c)
  }
  const byDate: Record<string, DailyStats> = {}
  for (const [date, arr] of Object.entries(closingsByDate)) {
    const best = arr.sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0))[0]
    const dd = newEmptyDay(date)
    dd.actual = best.actual_remit ?? 0
    dd.ck = best.total_cost ?? 0
    dd.totalRevenue = best.total_revenue ?? 0
    dd.closingStatus = (best.status ?? 'none') as DailyStats['closingStatus']
    for (const rv of (best.revenue_items ?? []) as any[]) {
      const ch = rv.channel
      const amt = rv.gross_amount ?? 0
      if (ch === 'pos') dd.pos += amt
      else if (ch === 'twpay') dd.twpay += amt
      else if (ch === 'panda') dd.panda += amt
      else if (ch === 'online') dd.online += amt
      else if (ch === 'online_cash') dd.online_cash += amt
      else if (ch === 'uber') dd.uber[rv.account_name ?? 'uber'] = (dd.uber[rv.account_name ?? 'uber'] ?? 0) + amt
      else if (ch === 'handwrite') {
        const key = rv.account_name ?? '手寫'
        dd.handwrite[key] = (dd.handwrite[key] ?? 0) + amt
        dd.handwriteTotal += amt
      }
    }
    // 央廚配送分項也算進 items（跟原 food-cost route 邏輯一致）
    for (const oi of (best.order_items ?? []) as any[]) {
      if (oi.item_name === '央廚配送') continue
      const amt = oi.total_amount ?? 0
      if (!amt) continue
      dd.items[oi.item_name] = (dd.items[oi.item_name] ?? 0) + amt
    }
    byDate[date] = dd
  }

  // 收據併入
  for (const r of (receipts ?? []) as any[]) {
    const dd = byDate[r.business_date] ?? (byDate[r.business_date] = newEmptyDay(r.business_date))
    dd.receipts.push({
      vendor_name: r.vendor_name ?? '',
      total_amount: r.total_amount ?? 0,
      tax_amount: r.tax_amount ?? 0,
      notes: r.notes ?? null,
      receipt_type: r.receipt_type ?? null,
      items: (r.receipt_items ?? []).map((it: any) => ({ item_name: it.item_name, amount: it.amount ?? 0 })),
    })
    for (const it of (r.receipt_items ?? []) as any[]) {
      if (!it.amount) continue
      dd.items[it.item_name] = (dd.items[it.item_name] ?? 0) + it.amount
    }
    // 稅金分流：receipt 內有耗材品項 → 稅算「免洗稅金」；否則歸雜項
    const tax = (r.tax_amount ?? 0) as number
    if (tax > 0) {
      const hasPack = (r.receipt_items ?? []).some((it: any) => {
        const m = itemMeta.get(it.item_name)
        return m?.category === '耗材'
      })
      if (hasPack) {
        dd.items['免洗稅金'] = (dd.items['免洗稅金'] ?? 0) + tax
      } else {
        // 抓第一個品項的 vendor_group，用該 vg 的稅金欄
        const firstItem = (r.receipt_items ?? [])[0]
        const m = firstItem ? itemMeta.get(firstItem.item_name) : null
        const vgTaxKey = m?.vendor_group ? `${m.vendor_group}_稅金` : '雜項稅金'
        dd.items[vgTaxKey] = (dd.items[vgTaxKey] ?? 0) + tax
      }
    }
  }

  // 補齊日曆內每一天（沒 closing 也要有 empty day）
  const startDate = new Date(firstDay + 'T12:00:00+08:00')
  const endDate = new Date(lastDay + 'T12:00:00+08:00')
  const days: DailyStats[] = []
  for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${d}`
    days.push(byDate[date] ?? newEmptyDay(date))
  }

  // ── 計算派生欄位 & 食/耗/雜 by category ──
  // 對齊使用者原 Excel 公式：
  //   現場   = POS − (TWPAY + Panda + Online + Uber) + handwrite (若 ichef_linked)
  //           或 POS + handwrite (若非 ichef_linked)
  //   總成本 = 食 + 耗 + 雜
  //   扣除後 = 現場 − 總成本            （原 Excel: C-N-SUM(D:F)）
  //   結果   = 實際 − 扣除後 − 配送     （原 Excel: I - G - J）
  //   營業額 = 結果 + 現場               （原 Excel: K + (C-SUM(D:F))）
  const uberSumOf = (dd: DailyStats) => Object.values(dd.uber).reduce((s, v) => s + v, 0)
  for (const dd of days) {
    // Step 1: 食/耗/雜 by category + vendor group breakdown + 依單據類型加總
    for (const [itemName, amt] of Object.entries(dd.items)) {
      const meta = itemMeta.get(itemName)
      if (!meta) continue
      if (meta.category === '食材') dd.food += amt
      else if (meta.category === '耗材') dd.pack += amt
      else dd.misc += amt

      const vg = meta.vendor_group
      const doc = meta.doc_type ?? ''
      if (!dd.vendorGroupBreakdown[vg]) dd.vendorGroupBreakdown[vg] = {}
      dd.vendorGroupBreakdown[vg][doc] = (dd.vendorGroupBreakdown[vg][doc] ?? 0) + amt

      // 依 doc_type 加總（跨食/耗/雜）
      if (doc === '發票') {
        dd.invoiceTotal += amt
        if (vg.includes('退稅')) dd.taxRefund += amt
      } else if (doc === '收據') {
        dd.receiptTotal += amt
      } else if (doc === '估價單') {
        dd.estimateTotal += amt
      }
    }
    dd.totalCost = dd.food + dd.pack + dd.misc

    // Step 2: 現場
    const uberSum = uberSumOf(dd)
    dd.onsite = (store.ichef_uber_linked
      ? (dd.pos - uberSum - dd.twpay - dd.panda - dd.online)
      : dd.pos
    ) + dd.handwriteTotal

    // Step 3: 扣除後 = 現場 − 總成本
    dd.after_deduct = dd.onsite - dd.totalCost

    // Step 4: 結果 = 實際 − 扣除後 − 配送
    dd.variance = dd.actual - dd.after_deduct - dd.ck

    // Step 5: 營業額 = 結果 + 現場（若現場 > 0）
    dd.revenue = dd.onsite > 0 ? dd.variance + dd.onsite : 0
  }

  return { store, items, days }
}

/** 月度統計（含月合計 + 品項月合計 + 特殊統計欄） */
export async function getMonthlyStats(storeId: string, year: number, monthNum: number): Promise<MonthlyStats> {
  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDay = getMonthLastDay(year, monthNum)
  const { store, items, days } = await getRangeStats(storeId, firstDay, lastDay)
  const itemMeta = new Map(items.map(i => [i.name, i] as const))

  // 月合計
  const totals = newEmptyDay('')
  totals.weekday = ''
  for (const dd of days) {
    totals.pos += dd.pos
    totals.twpay += dd.twpay
    totals.panda += dd.panda
    totals.online += dd.online
    totals.online_cash += dd.online_cash
    for (const [k, v] of Object.entries(dd.uber)) totals.uber[k] = (totals.uber[k] ?? 0) + v
    for (const [k, v] of Object.entries(dd.handwrite)) totals.handwrite[k] = (totals.handwrite[k] ?? 0) + v
    totals.handwriteTotal += dd.handwriteTotal
    totals.actual += dd.actual
    totals.ck += dd.ck
    totals.onsite += dd.onsite
    totals.variance += dd.variance
    totals.after_deduct += dd.after_deduct
    totals.revenue += dd.revenue
    totals.totalRevenue += dd.totalRevenue
    totals.food += dd.food
    totals.pack += dd.pack
    totals.misc += dd.misc
    totals.totalCost += dd.totalCost
    totals.invoiceTotal += dd.invoiceTotal
    totals.receiptTotal += dd.receiptTotal
    totals.estimateTotal += dd.estimateTotal
    totals.taxRefund += dd.taxRefund
    for (const [k, v] of Object.entries(dd.items)) totals.items[k] = (totals.items[k] ?? 0) + v
  }

  // 品項月合計（含 vendor_group / doc_type / category）
  const itemMonthlyTotals: MonthlyStats['itemMonthlyTotals'] = []
  for (const [itemName, total] of Object.entries(totals.items)) {
    if (!total) continue
    const meta = itemMeta.get(itemName)
    if (!meta) continue
    itemMonthlyTotals.push({
      vendor_group: meta.vendor_group,
      vendor_group_sort_order: meta.vendor_group_sort_order,
      doc_type: meta.doc_type ?? '',
      item_name: itemName,
      category: meta.category,
      total,
    })
  }
  itemMonthlyTotals.sort((a, b) =>
    a.vendor_group_sort_order - b.vendor_group_sort_order
    || a.vendor_group.localeCompare(b.vendor_group)
    || a.doc_type.localeCompare(b.doc_type)
    || a.item_name.localeCompare(b.item_name)
  )

  // 特殊統計欄（已在 daily loop 累計，這裡直接用 totals）
  return {
    year, monthNum,
    storeName: store.name,
    daily: days,
    totals,
    itemMonthlyTotals,
    totalInvoice: totals.invoiceTotal,
    totalReceipt: totals.receiptTotal,
    liangpingRefund: totals.taxRefund,
  }
}

/** 單日 stats（快速取一天） */
export async function getDailyStats(storeId: string, date: string): Promise<DailyStats | null> {
  const { days } = await getRangeStats(storeId, date, date)
  return days[0] ?? null
}
