'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRangeStats, getMonthlyStats, type DailyStats, type MonthlyStats } from '@/lib/store-aggregator'

type AccountingItemMeta = {
  category: '食材' | '耗材' | '雜項'
  vendor_group: string
  doc_type: string | null
  is_refund: boolean
}

async function checkHqAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '無權限' as const }
  return { ok: true as const }
}

export async function fetchDailyStats(storeId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  // 同時撈昨日，讓 UI 顯示 delta
  const yesterday = new Date(date + 'T12:00:00+08:00')
  yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)

  const { days } = await getRangeStats(storeId, yStr, date)
  const prev = days.find(d => d.date === yStr) ?? null
  const cur = days.find(d => d.date === date) ?? null
  return { success: true as const, stats: cur as DailyStats | null, prev: prev as DailyStats | null }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function emptyAccountingDay(date: string): DailyStats {
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
    items: {}, notes: {}, vendorGroupBreakdown: {}, receipts: [],
    closingStatus: 'none', isHoliday: false, holidayNote: null,
  }
}

async function getAccountingItemMeta(storeId: string): Promise<Map<string, AccountingItemMeta>> {
  const admin = createAdminClient()
  const { data: mappings } = await admin.from('item_column_mappings')
    .select('item_name, item_category, vendor_group, doc_type_override, is_refund, store_id')
    .eq('store_id', storeId)
  return new Map(
    ((mappings ?? []) as any[]).map((mapping: any) => {
      const vendorGroup = (mapping.vendor_group ?? '未分類') as string
      return [mapping.item_name as string, {
        category: (mapping.item_category ?? '雜項') as AccountingItemMeta['category'],
        vendor_group: vendorGroup,
        doc_type: (mapping.doc_type_override ?? null) as string | null,
        is_refund: !!mapping.is_refund,
      }]
    }),
  )
}

function buildDailyAccountingStats({
  date,
  store,
  closing,
  receipts,
  itemMeta,
  holidayNote,
}: {
  date: string
  store: any
  closing: any | null
  receipts: any[]
  itemMeta: Map<string, AccountingItemMeta>
  holidayNote: string | null
}): DailyStats | null {
  if (!closing && receipts.length === 0 && holidayNote === null) return null

  const day = emptyAccountingDay(date)
  day.channels = {
    twpay: !!store?.twpay_enabled,
    panda: !!store?.panda_enabled,
    online: !!store?.online_enabled,
    online_cash: !!store?.online_cash_enabled,
    uber: !!store?.uber_enabled || (((store?.uber_accounts ?? []) as string[]).length > 0),
  }
  if (holidayNote !== null) {
    day.isHoliday = true
    day.holidayNote = holidayNote
  }

  if (closing) {
    day.actual = closing.actual_remit ?? 0
    const ckFromOrders = (closing.order_items ?? [])
      .filter((oi: any) => oi.item_name !== '央廚配送')
      .reduce((sum: number, oi: any) => sum + (oi.total_amount ?? 0), 0)
    day.ck = (closing.total_cost ?? 0) > 0 ? (closing.total_cost ?? 0) : ckFromOrders
    day.totalRevenue = closing.total_revenue ?? 0
    day.closingStatus = (closing.status ?? 'none') as DailyStats['closingStatus']

    for (const rv of (closing.revenue_items ?? []) as any[]) {
      const amt = rv.gross_amount ?? 0
      if (rv.channel === 'pos') day.pos += amt
      else if (rv.channel === 'twpay') day.twpay += amt
      else if (rv.channel === 'panda') day.panda += amt
      else if (rv.channel === 'online') day.online += amt
      else if (rv.channel === 'online_cash') day.online_cash += amt
      else if (rv.channel === 'uber') {
        const key = rv.account_name ?? 'uber'
        day.uber[key] = (day.uber[key] ?? 0) + amt
      } else if (rv.channel === 'handwrite') {
        const key = rv.account_name ?? '手寫'
        day.handwrite[key] = (day.handwrite[key] ?? 0) + amt
        day.handwriteTotal += amt
      }
    }

    for (const oi of (closing.order_items ?? []) as any[]) {
      if (oi.item_name === '央廚配送') continue
      const amt = oi.total_amount ?? 0
      if (!amt) continue
      day.items[oi.item_name] = (day.items[oi.item_name] ?? 0) + amt
    }
  }

  for (const receipt of receipts) {
    const noteText = (receipt.notes as string | null | undefined)?.trim() ?? ''
    const notedItemNames = new Set<string>()
    day.receipts.push({
      vendor_name: receipt.vendor_name ?? '',
      actual_vendor_name: receipt.actual_vendor_name ?? null,
      total_amount: receipt.total_amount ?? 0,
      tax_amount: receipt.tax_amount ?? 0,
      notes: receipt.notes ?? null,
      receipt_type: receipt.receipt_type ?? null,
      items: (receipt.receipt_items ?? []).map((it: any) => ({ item_name: it.item_name, amount: it.amount ?? 0 })),
    })

    for (const item of (receipt.receipt_items ?? []) as any[]) {
      const amt = item.amount ?? 0
      if (!amt) continue
      day.items[item.item_name] = (day.items[item.item_name] ?? 0) + amt
      if (noteText && !notedItemNames.has(item.item_name)) {
        day.notes[item.item_name] = day.notes[item.item_name]
          ? `${day.notes[item.item_name]}\n${noteText}`
          : noteText
        notedItemNames.add(item.item_name)
      }
    }

    const receiptItems = (receipt.receipt_items ?? []) as any[]
    const taxAmount = Number(receipt.tax_amount) || 0
    // 稅外加已另存「X-稅金」品項時，排除該筆再和未稅總額核對，
    // 避免把稅金第二次從第一個品項扣掉。
    const nonTaxItems = receiptItems.filter(item => {
      const name = String(item.item_name ?? '').replace(/[\s　]/g, '')
      const amount = Number(item.amount) || 0
      return !(taxAmount > 0 && amount === taxAmount && (name.endsWith('稅金') || name.endsWith('稅')))
    })
    const itemSum = nonTaxItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const untaxedTotal = Math.round((Number(receipt.total_amount) || 0) - taxAmount)
    const remainder = untaxedTotal - itemSum
    if (remainder !== 0 && nonTaxItems.length > 0) {
      const target = nonTaxItems.find(item => (item.item_name ?? '').trim())
      if (target?.item_name) {
        day.items[target.item_name] = (day.items[target.item_name] ?? 0) + remainder
      }
    }

    const tax = (receipt.tax_amount ?? 0) as number
    const hasExplicitTaxItem = receiptItems.some(item => {
      const name = String(item.item_name ?? '').replace(/[\s　]/g, '')
      return tax > 0 && (Number(item.amount) || 0) === tax && (name.endsWith('稅金') || name.endsWith('稅'))
    })
    if (tax > 0 && !hasExplicitTaxItem) {
      const hasPack = (receipt.receipt_items ?? []).some((it: any) => itemMeta.get(it.item_name)?.category === '耗材')
      if (hasPack) {
        day.items['免洗稅金'] = (day.items['免洗稅金'] ?? 0) + tax
      } else {
        const firstItem = (receipt.receipt_items ?? [])[0]
        const meta = firstItem ? itemMeta.get(firstItem.item_name) : null
        const taxKey = meta?.vendor_group ? `${meta.vendor_group}稅金` : '雜項稅金'
        day.items[taxKey] = (day.items[taxKey] ?? 0) + tax
      }
    }
  }

  for (const [itemName, amount] of Object.entries(day.items)) {
    const meta = itemMeta.get(itemName)
    if (!meta) {
      day.misc += amount
      continue
    }
    if (meta.category === '食材') day.food += amount
    else if (meta.category === '耗材') day.pack += amount
    else day.misc += amount

    const vendorGroup = meta.vendor_group
    const docType = meta.doc_type ?? ''
    if (!day.vendorGroupBreakdown[vendorGroup]) day.vendorGroupBreakdown[vendorGroup] = {}
    day.vendorGroupBreakdown[vendorGroup][docType] = (day.vendorGroupBreakdown[vendorGroup][docType] ?? 0) + amount
    if (docType === '發票') day.invoiceTotal += amount
    else if (docType === '收據') day.receiptTotal += amount
    else if (docType === '估價單') day.estimateTotal += amount
    if (meta.is_refund) day.taxRefund += amount
  }

  day.totalCost = day.food + day.pack + day.misc
  const uberTotal = Object.values(day.uber).reduce((sum, amount) => sum + amount, 0)
  day.onsite = (store?.ichef_uber_linked
    ? (day.pos - uberTotal - day.twpay - day.panda - day.online)
    : day.pos
  ) + day.handwriteTotal
  day.after_deduct = day.onsite - day.totalCost
  day.variance = day.actual - day.after_deduct - day.ck
  day.revenue = day.onsite > 0 ? day.variance + day.onsite : 0

  return day
}

async function loadDailyAccountingDetail(admin: ReturnType<typeof createAdminClient>, storeId: string, date: string) {
  const [storeRes, closingsRes, receiptsRes, holidayRes, itemMeta] = await Promise.all([
    admin.from('stores')
      .select('id, name, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, online_cash_enabled')
      .eq('id', storeId)
      .maybeSingle(),
    admin.from('daily_closings')
      .select(`
        id, business_date, status, note, dispute_note, submitted_by,
        total_revenue, total_cost, total_expenses, expected_remit, variance,
        actual_remit, should_include_delivery, remittance_adjustments, reserve_items,
        cash_counts(large_expenses),
        ck_delivery_photo_url, channel_photo_urls,
        envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls,
        stores(id, name),
        revenue_items(channel, account_name, gross_amount),
        order_items(item_name, quantity, unit_price, total_amount),
        handwrite_orders(order_number, amount, voided, void_reason),
        expense_items(description, amount)
      `)
      .eq('store_id', storeId)
      .eq('business_date', date),
    admin.from('receipts')
      .select('id, vendor_name, actual_vendor_name, receipt_type, total_amount, tax_amount, notes, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .order('created_at'),
    admin.from('store_holidays').select('note').eq('store_id', storeId).eq('holiday_date', date).maybeSingle(),
    getAccountingItemMeta(storeId),
  ])

  if (!storeRes.data) return { error: '找不到店家' as const }

  const closing = closingsRes.data?.[0] ?? null
  const receipts = receiptsRes.data ?? []
  const stats = buildDailyAccountingStats({
    date,
    store: storeRes.data,
    closing,
    receipts,
    itemMeta,
    holidayNote: holidayRes.data ? ((holidayRes.data.note as string | null) ?? '') : null,
  })

  let submitterName: string | null = null
  if (closing?.submitted_by) {
    const { data: prof } = await admin
      .from('user_profiles')
      .select('name')
      .eq('user_id', closing.submitted_by)
      .maybeSingle()
    submitterName = prof?.name ?? null
  }

  return { success: true as const, stats, closing, receipts, submitterName }
}

export async function fetchDailyAccountingDetail(storeId: string, date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  return loadDailyAccountingDetail(createAdminClient(), storeId, date)
}

export async function fetchDailyAccountingDetailsBatch(storeIds: string[], date: string) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!date) return { error: '缺少日期' as const }

  const uniqueStoreIds = [...new Set(storeIds)].filter(Boolean)
  if (uniqueStoreIds.length === 0) return { success: true as const, details: {}, errors: {} }

  const admin = createAdminClient()
  const entries = await Promise.all(uniqueStoreIds.map(async storeId => {
    const result = await loadDailyAccountingDetail(admin, storeId, date)
    return [storeId, result] as const
  }))

  const details: Record<string, any> = {}
  const errors: Record<string, string> = {}
  for (const [storeId, result] of entries) {
    if ('error' in result && result.error) errors[storeId] = result.error
    else details[storeId] = result
  }

  return { success: true as const, details, errors }
}

/** 撈當日 closing + receipts（給店家總覽 daily panel 內嵌審核卡用） */
export async function fetchDailyClosingWithReceipts(storeId: string, date: string, includeSubmitter = true) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !date) return { error: '缺少參數' as const }

  const admin = createAdminClient()
  const [closingsRes, receiptsRes] = await Promise.all([
    admin.from('daily_closings')
      .select(`
        id, business_date, status, note, dispute_note, submitted_by,
        total_revenue, total_cost, total_expenses, expected_remit, variance,
        actual_remit, should_include_delivery, remittance_adjustments, reserve_items,
        cash_counts(large_expenses),
        ck_delivery_photo_url, channel_photo_urls,
        envelope_photo_url, void_invoice_photo_urls, note_photo_url, extra_photo_urls,
        stores(id, name),
        revenue_items(channel, account_name, gross_amount),
        order_items(item_name, quantity, unit_price, total_amount),
        handwrite_orders(order_number, amount, voided, void_reason),
        expense_items(description, amount)
      `)
      .eq('store_id', storeId)
      .eq('business_date', date),
    admin.from('receipts')
      .select('id, vendor_name, actual_vendor_name, receipt_type, total_amount, tax_amount, notes, photo_url, receipt_items(item_name, quantity, unit, unit_price, amount), created_at')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .order('created_at'),
  ])

  const closing = closingsRes.data?.[0] ?? null
  let receipts: any[] = receiptsRes.data ?? []
  let submitterName: string | null = null
  if (closing) {
    if (includeSubmitter && closing.submitted_by) {
      const { data: prof } = await admin.from('user_profiles').select('name').eq('user_id', closing.submitted_by).maybeSingle()
      submitterName = prof?.name ?? null
    }
  }
  return { success: true as const, closing, receipts, submitterName }
}

export async function fetchMonthlyStats(storeId: string, year: number, monthNum: number) {
  const auth = await checkHqAuth()
  if ('error' in auth) return auth
  if (!storeId || !year || !monthNum) return { error: '缺少參數' as const }

  // 同時撈上月，讓 UI 顯示 delta
  const prevYear = monthNum === 1 ? year - 1 : year
  const prevMonth = monthNum === 1 ? 12 : monthNum - 1
  const [stats, prev] = await Promise.all([
    getMonthlyStats(storeId, year, monthNum),
    getMonthlyStats(storeId, prevYear, prevMonth),
  ])
  return { success: true as const, stats: stats as MonthlyStats, prev: prev as MonthlyStats }
}
