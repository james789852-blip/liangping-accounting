import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getAuth() {
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const private_key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!client_email || !private_key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

interface DayData {
  items: Record<string, number>
  notes: Record<string, string>
  pos: number; twpay: number
  uber: Record<string, number>
  onsite: number; actual: number; ck: number
  revenue: number; variance: number
}

interface RowVals {
  pos: number; twpay: number; uber: Record<string, number>
  after_deduct: number; onsite: number; actual: number; ck: number
  result: number; revenue: number
  items: Record<string, number>
  foodTotal: number; packTotal: number; miscTotal: number; grandTotal: number
}

export async function syncClosingToSheets(closingId: string): Promise<void> {
  const admin = createAdminClient()

  // Fetch the closing to get store and date
  const { data: closing } = await admin
    .from('daily_closings')
    .select('store_id, business_date')
    .eq('id', closingId)
    .single()
  if (!closing) return

  const storeId = closing.store_id as string
  const businessDate = closing.business_date as string
  const [yearStr, monthStr] = businessDate.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const month = `${yearStr}-${monthStr}`
  const firstDay = `${month}-01`
  const lastDay = new Date(year, monthNum, 0).toISOString().slice(0, 10)

  // Fetch store info including Google Sheet ID
  const { data: storeRow } = await admin
    .from('stores')
    .select('name, uber_accounts, ichef_uber_linked, google_sheets_id')
    .eq('id', storeId)
    .single()

  const sheetsId = storeRow?.google_sheets_id as string | null
  if (!sheetsId) return  // No sheet configured for this store

  const storeName = storeRow?.name as string ?? 'store'
  const uberAccounts: string[] = (storeRow?.uber_accounts as string[]) ?? []
  const ichefLinked: boolean = (storeRow?.ichef_uber_linked as boolean) ?? false
  const N = uberAccounts.length

  // Fetch all month data
  const [{ data: receipts }, { data: closings }, { data: mappingsRaw }, { data: ckPricesData }] = await Promise.all([
    admin.from('receipts')
      .select('business_date, total_amount, tax_amount, receipt_type, notes, receipt_items(item_name, excel_column, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('daily_closings')
      .select('business_date, total_revenue, actual_remit, variance, revenue_items(channel, gross_amount, account_name), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('item_column_mappings')
      .select('item_name, excel_column, item_category, store_id')
      .or(`store_id.is.null,store_id.eq.${storeId}`),
    admin.from('central_kitchen_prices').select('item_name, excel_column').eq('active', true),
  ])

  const mappingLookup: Record<string, string> = {}
  const categoryLookup: Record<string, string> = {}
  for (const m of (mappingsRaw ?? []).filter((m: AnyRecord) => !m.store_id)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
  }
  for (const m of (mappingsRaw ?? []).filter((m: AnyRecord) => m.store_id === storeId)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
  }
  const ckColLookup: Record<string, string> = {}
  for (const p of (ckPricesData ?? []) as AnyRecord[]) {
    ckColLookup[p.item_name] = p.excel_column || p.item_name
  }

  // Load store-specific columns if available
  let storeColumns = EXCEL_COLUMNS
  try {
    const { data: colFile } = await admin.storage.from('excel-templates').download(`${storeId}-columns.json`)
    if (colFile) {
      const parsed = JSON.parse(await colFile.text())
      if (parsed['食材']?.length && parsed['耗材']?.length && parsed['雜項']?.length) {
        storeColumns = parsed
      }
    }
  } catch { /* fallback to defaults */ }

  const foodCols: string[] = storeColumns['食材']
  const packCols: string[] = storeColumns['耗材']
  const miscCols: string[] = storeColumns['雜項']

  const byDate: Record<string, DayData> = {}
  function ensureDay(d: string): DayData {
    if (!byDate[d]) byDate[d] = { items: {}, notes: {}, pos: 0, twpay: 0, uber: {}, onsite: 0, actual: 0, ck: 0, revenue: 0, variance: 0 }
    return byDate[d]
  }

  let invoiceTotal = 0, receiptTotal = 0
  for (const r of (receipts ?? []) as AnyRecord[]) {
    const dd = ensureDay(r.business_date)
    const resolvedItems = (r.receipt_items ?? []).map((it: AnyRecord) => ({
      ...it, resolved_col: mappingLookup[it.item_name] ?? it.excel_column ?? '',
    }))
    const validItems = resolvedItems.filter((it: AnyRecord) => it.resolved_col && it.amount)
    const positiveItems = validItems.filter((it: AnyRecord) => (it.amount as number) > 0)
    const itemsSum = positiveItems.reduce((s: number, it: AnyRecord) => s + (it.amount as number), 0)
    for (const it of validItems) {
      dd.items[it.resolved_col] = (dd.items[it.resolved_col] || 0) + (it.amount as number)
    }
    if ((r.notes as string)?.trim() && validItems.length > 0) {
      const noteText = (r.notes as string).trim()
      for (const it of validItems) {
        const col = it.resolved_col as string
        dd.notes[col] = dd.notes[col] ? `${dd.notes[col]}\n${noteText}` : noteText
      }
    }
    const taxAmt = (r.tax_amount ?? 0) as number
    let routedTax = 0
    if (taxAmt > 0 && positiveItems.length > 0) {
      const hasPackItem = positiveItems.some((it: AnyRecord) =>
        categoryLookup[it.item_name] === '耗材' || packCols.includes(it.resolved_col)
      )
      if (hasPackItem) {
        dd.items['免洗稅金'] = (dd.items['免洗稅金'] || 0) + taxAmt
        routedTax = taxAmt
      }
    }
    const unallocated = (r.total_amount ?? 0) - itemsSum - routedTax
    if (unallocated > 0 && itemsSum > 0) {
      for (const it of positiveItems) {
        const share = Math.round(unallocated * (it.amount as number) / itemsSum)
        dd.items[it.resolved_col] = (dd.items[it.resolved_col] || 0) + share
      }
    }
    if (r.receipt_type === 'invoice') invoiceTotal += (r.total_amount ?? 0) as number
    else if (r.receipt_type === 'receipt') receiptTotal += (r.total_amount ?? 0) as number
  }

  for (const c of (closings ?? []) as AnyRecord[]) {
    const dd = ensureDay(c.business_date)
    dd.revenue  = (c.total_revenue  ?? 0) as number
    dd.actual   = (c.actual_remit   ?? 0) as number
    dd.variance = (c.variance       ?? 0) as number
    let panda = 0, online = 0
    for (const rv of (c.revenue_items as AnyRecord[]) ?? []) {
      if (rv.channel === 'pos')    dd.pos   += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'twpay') dd.twpay  += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'panda') panda     += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'online') online   += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'uber' && rv.account_name) {
        dd.uber[rv.account_name as string] = (dd.uber[rv.account_name as string] || 0) + ((rv.gross_amount ?? 0) as number)
      }
    }
    const uberSum = Object.values(dd.uber).reduce((s, v) => s + v, 0)
    dd.onsite = ichefLinked ? (dd.pos - uberSum - dd.twpay - panda - online) : dd.pos
    let ckItemsSum = 0
    for (const oi of (c.order_items as AnyRecord[]) ?? []) {
      if (oi.item_name === '央廚配送') {
        dd.ck = (oi.total_amount ?? 0) as number
      } else {
        const excelCol = mappingLookup[oi.item_name] ?? ckColLookup[oi.item_name] ?? oi.item_name
        if (excelCol && (oi.total_amount || 0) > 0) {
          dd.items[excelCol] = (dd.items[excelCol] || 0) + (oi.total_amount as number)
        }
        if ((oi.item_name in ckColLookup) && (oi.total_amount || 0) > 0) ckItemsSum += oi.total_amount as number
      }
    }
    if (dd.ck === 0 && ckItemsSum > 0) dd.ck = ckItemsSum
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )

  const dataRows: Array<{ date: string; row: RowVals }> = days.map(date => {
    const d = byDate[date]
    const pos      = d?.pos ?? 0
    const twpay    = d?.twpay ?? 0
    const uber     = d?.uber ?? {}
    const onsite   = d?.onsite ?? 0
    const actual   = d?.actual ?? 0
    const ck       = d?.ck ?? 0
    const variance = d?.variance ?? 0
    const after_deduct = actual - ck - variance
    const computedRevenue = onsite + variance
    const items = d?.items ?? {}
    const foodTotal = foodCols.reduce((s, col) => s + (items[col] || 0), 0)
    const packTotal = packCols.reduce((s, col) => s + (items[col] || 0), 0)
    const miscTotal = miscCols.reduce((s, col) => s + (items[col] || 0), 0)
    return { date, row: { pos, twpay, uber, after_deduct, onsite, actual, ck, result: variance, revenue: computedRevenue, items, foodTotal, packTotal, miscTotal, grandTotal: foodTotal + packTotal + miscTotal } }
  })

  const sumOf = (fn: (r: RowVals) => number) => dataRows.reduce((s, { row }) => s + fn(row), 0)
  const totals: RowVals = {
    pos:          sumOf(r => r.pos),
    twpay:        sumOf(r => r.twpay),
    uber:         Object.fromEntries(uberAccounts.map(acc => [acc, dataRows.reduce((s, { row }) => s + (row.uber[acc] ?? 0), 0)])),
    after_deduct: sumOf(r => r.after_deduct),
    onsite:       sumOf(r => r.onsite),
    actual:       sumOf(r => r.actual),
    ck:           sumOf(r => r.ck),
    result:       sumOf(r => r.result),
    revenue:      sumOf(r => r.revenue),
    items:        Object.fromEntries([...foodCols, ...packCols, ...miscCols].map(col => [col, dataRows.reduce((s, { row }) => s + (row.items[col] || 0), 0)])),
    foodTotal:    sumOf(r => r.foodTotal),
    packTotal:    sumOf(r => r.packTotal),
    miscTotal:    sumOf(r => r.miscTotal),
    grandTotal:   sumOf(r => r.grandTotal),
  }
  const lianpingTaxRefund = totals.items['免洗稅金'] ?? 0

  // Column layout (0-indexed)
  const BASE = 4 + N
  const COL_AFTER_DEDUCT = BASE
  const COL_ONSITE       = BASE + 1
  const COL_ACTUAL       = BASE + 2
  const COL_CK           = BASE + 3
  const COL_RESULT       = BASE + 4
  const COL_REVENUE      = BASE + 5
  const COL_SPACER       = BASE + 6
  const COL_TOTAL        = BASE + 7
  const COL_FOOD_SUB     = BASE + 8
  const COL_PACK_SUB     = BASE + 9
  const COL_MISC_SUB     = BASE + 10
  const COL_FOOD_START   = BASE + 11
  const COL_PACK_START   = COL_FOOD_START + foodCols.length
  const COL_MISC_START   = COL_PACK_START + packCols.length
  const TOTAL_COLS       = COL_MISC_START + miscCols.length

  function makeRow(): (string | number)[] { return Array(TOTAL_COLS).fill('') }

  function rowToValues(date: string | null, row: RowVals): (string | number)[] {
    const vals = makeRow()
    if (date) {
      const dt = new Date(date + 'T12:00:00+08:00')
      vals[0] = date
      vals[1] = `星期${WEEKDAYS[dt.getDay()]}`
    } else {
      vals[0] = `${monthNum}月合計`
    }
    vals[2] = row.pos || ''
    vals[3] = row.twpay || ''
    for (let i = 0; i < N; i++) vals[4 + i] = row.uber[uberAccounts[i]] || ''
    vals[COL_AFTER_DEDUCT] = row.after_deduct || ''
    vals[COL_ONSITE]       = row.onsite || ''
    vals[COL_ACTUAL]       = row.actual || ''
    vals[COL_CK]           = row.ck || ''
    vals[COL_RESULT]       = row.result || ''
    vals[COL_REVENUE]      = row.revenue || ''
    vals[COL_SPACER]       = ''
    vals[COL_TOTAL]        = row.grandTotal || ''
    vals[COL_FOOD_SUB]     = row.foodTotal || ''
    vals[COL_PACK_SUB]     = row.packTotal || ''
    vals[COL_MISC_SUB]     = row.miscTotal || ''
    for (let i = 0; i < foodCols.length; i++) vals[COL_FOOD_START + i] = row.items[foodCols[i]] || ''
    for (let i = 0; i < packCols.length; i++) vals[COL_PACK_START + i] = row.items[packCols[i]] || ''
    for (let i = 0; i < miscCols.length; i++) vals[COL_MISC_START + i] = row.items[miscCols[i]] || ''
    return vals
  }

  // Row 1: vendor group labels
  const row1 = makeRow()
  row1[COL_TOTAL]    = '梁平退稅'
  row1[COL_FOOD_SUB] = lianpingTaxRefund || ''
  row1[COL_FOOD_START]      = '央廚配送'
  row1[COL_FOOD_START + 6]  = '振源'
  row1[COL_FOOD_START + 7]  = '小雲'
  row1[COL_FOOD_START + 8]  = '菜商'
  row1[COL_FOOD_START + 17] = '雜貨'
  row1[COL_PACK_START]      = '免洗'
  row1[COL_MISC_START]      = '感熱紙'
  row1[COL_MISC_START + 13] = '固定費用'

  // Row 2: invoice/receipt totals
  const row2 = makeRow()
  row2[COL_TOTAL]    = '總發票'
  row2[COL_FOOD_SUB] = invoiceTotal || ''
  row2[COL_PACK_SUB] = '總收據'
  row2[COL_MISC_SUB] = receiptTotal || ''

  // Row 3: column headers
  const row3 = makeRow()
  row3[0] = '日期'; row3[1] = '星期'; row3[2] = 'POS'; row3[3] = 'TWPAY'
  for (let i = 0; i < N; i++) row3[4 + i] = uberAccounts[i]
  row3[COL_AFTER_DEDUCT] = '扣除後的$'
  row3[COL_ONSITE]       = '現場'
  row3[COL_ACTUAL]       = '實際$'
  row3[COL_CK]           = '配送(月底結)'
  row3[COL_RESULT]       = '結果'
  row3[COL_REVENUE]      = '營業額'
  row3[COL_TOTAL]        = '總'
  row3[COL_FOOD_SUB]     = '食材'
  row3[COL_PACK_SUB]     = '耗材'
  row3[COL_MISC_SUB]     = '雜項'
  for (let i = 0; i < foodCols.length; i++) row3[COL_FOOD_START + i] = foodCols[i]
  for (let i = 0; i < packCols.length; i++) row3[COL_PACK_START + i] = packCols[i]
  for (let i = 0; i < miscCols.length; i++) row3[COL_MISC_START + i] = miscCols[i]

  const allValues: (string | number)[][] = [
    row1, row2, row3,
    rowToValues(null, totals),
    ...dataRows.map(({ date, row }) => rowToValues(date, row)),
  ]

  // Write to Google Sheets
  const tabName = `${year}年${monthNum}月食耗成本`
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Get existing sheets to check if tab already exists
  const { data: spreadsheet } = await sheets.spreadsheets.get({ spreadsheetId: sheetsId })
  const existingSheet = spreadsheet.sheets?.find(s => s.properties?.title === tabName)

  if (existingSheet) {
    // Clear existing content first
    await sheets.spreadsheets.values.clear({ spreadsheetId: sheetsId, range: `'${tabName}'` })
  } else {
    // Create new tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetsId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
  }

  // Write all values
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: allValues },
  })

  console.log(`[syncClosingToSheets] ${storeName} ${year}-${String(monthNum).padStart(2, '0')} → sheet "${tabName}" done`)
}

// Sync an entire month directly by storeId + month (for manual re-sync of historical data)
export async function syncMonthToSheets(storeId: string, month: string): Promise<void> {
  const admin = createAdminClient()
  const [yearStr, monthStr] = month.split('-')
  const firstDay = `${month}-01`
  const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).toISOString().slice(0, 10)

  const { data: closing } = await admin
    .from('daily_closings')
    .select('id')
    .eq('store_id', storeId)
    .gte('business_date', firstDay)
    .lte('business_date', lastDay)
    .limit(1)
    .single()

  if (!closing) throw new Error('此月份無帳目資料')
  await syncClosingToSheets(closing.id)
}
