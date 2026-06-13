import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { type RowVals, fillWorksheet, extractValues, extractColors, extractBold, extractColWidths, extractMerges } from '@/lib/food-cost-template'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_CREDENTIALS env var')
  let credentials: { client_email: string; private_key: string }
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS is not valid JSON')
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS missing client_email or private_key')
  }
  return new google.auth.GoogleAuth({
    credentials,
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
    const notes = d?.notes ?? {}
    return { date, row: { pos, twpay, uber, after_deduct, onsite, actual, ck, result: variance, revenue: computedRevenue, items, notes, foodTotal, packTotal, miscTotal, grandTotal: foodTotal + packTotal + miscTotal } }
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
    notes:        {},
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

  // Get or create tab
  const { data: spreadsheet } = await sheets.spreadsheets.get({ spreadsheetId: sheetsId })
  const existingSheet = spreadsheet.sheets?.find(s => s.properties?.title === tabName)
  let sheetId: number

  if (existingSheet) {
    sheetId = existingSheet.properties?.sheetId ?? 0
    await sheets.spreadsheets.values.clear({ spreadsheetId: sheetsId, range: `'${tabName}'` })
  } else {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetsId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
    sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
  }

  // ── Template path: fill uploaded Excel template → extract values+colors → write to Sheets ──
  let usedTemplate = false
  try {
    const { data: tmpl, error: tmplErr } = await admin.storage.from('excel-templates').download(`${storeId}.xlsx`)
    if (tmplErr) console.log(`[syncClosingToSheets] no template for store ${storeId}: ${tmplErr.message}`)
    if (tmpl) {
      const wb = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(Buffer.from(await tmpl.arrayBuffer()) as any)
      const targetName = `${monthNum}月食耗成本`
      const ws = wb.getWorksheet(targetName)
        ?? wb.getWorksheet(`${monthNum}月`)
        ?? wb.worksheets.find(s => s.name.includes('食耗'))
        ?? wb.worksheets[0]
      if (ws) {
        const filled = await fillWorksheet(ws, days, dataRows, uberAccounts)
        if (filled) {
          const wsValues = extractValues(ws)
          const wsWidths = extractColWidths(ws)
          const wsMerges = extractMerges(ws)

          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetsId,
            range: `'${tabName}'!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: wsValues.map(row => row.map(v => v ?? '')) },
          })

          await applyTemplateFormatting(sheets, sheetsId, sheetId, [], [], wsWidths, wsMerges, ws)

          usedTemplate = true
          console.log(`[syncClosingToSheets] ${storeName} ${year}-${String(monthNum).padStart(2, '0')} → sheet "${tabName}" done (template)`)
        }
      }
    }
  } catch (e) {
    console.warn('[syncClosingToSheets] template path failed, falling back to generated layout:', e)
  }

  if (!usedTemplate) {
    // Fallback: write generated values and apply hardcoded formatting
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetsId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: allValues },
    })
    await applySheetFormatting(sheets, sheetsId, sheetId, days.length, N, foodCols.length, packCols.length, miscCols.length, BASE)
    console.log(`[syncClosingToSheets] ${storeName} ${year}-${String(monthNum).padStart(2, '0')} → sheet "${tabName}" done (generated)`)
  }
}

type SheetsAPI = ReturnType<typeof google.sheets>
type RGB = { red: number; green: number; blue: number }

function hex(h: string): RGB {
  return { red: parseInt(h.slice(0,2),16)/255, green: parseInt(h.slice(2,4),16)/255, blue: parseInt(h.slice(4,6),16)/255 }
}

function argbToRgb(argb: string): RGB {
  let h = argb.replace('#', '')
  if (h.length === 8) h = h.slice(2) // strip alpha channel
  return { red: parseInt(h.slice(0,2),16)/255, green: parseInt(h.slice(2,4),16)/255, blue: parseInt(h.slice(4,6),16)/255 }
}

async function applyTemplateFormatting(
  sheets: SheetsAPI,
  spreadsheetId: string,
  sheetId: number,
  _colors: (string | null)[][],   // kept for signature compat, unused — ws read directly
  _bold: boolean[][],
  colWidths: Array<{ col: number; px: number }>,
  merges: Array<{ r0: number; r1: number; c0: number; c1: number }>,
  ws: ExcelJS.Worksheet,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqs: any[] = []

  // Unmerge all first
  reqs.push({ unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 300 } } })

  const maxRow = ws.rowCount
  const maxCol = ws.columnCount

  // Reset everything to white/default first
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: maxRow, startColumnIndex: 0, endColumnIndex: maxCol }, cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { bold: false, fontSize: 10, foregroundColor: { red: 0, green: 0, blue: 0 } }, horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment' } })

  // Apply per-cell formatting extracted directly from the worksheet
  // We batch consecutive cells with identical formatting in the same row
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type CellFmt = { bg: RGB; bold: boolean; fontSize: number; fgColor: RGB; hAlign: string }
    const cells: CellFmt[] = []
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fillObj = cell.fill as any
      let bg: RGB = { red: 1, green: 1, blue: 1 }
      if (fillObj?.type === 'pattern' && fillObj.pattern !== 'none' && fillObj.fgColor?.argb) {
        bg = argbToRgb(fillObj.fgColor.argb as string)
      }
      const fontObj = cell.font
      const bold = fontObj?.bold ?? false
      const fontSize = fontObj?.size ?? 10
      let fgColor: RGB = { red: 0, green: 0, blue: 0 }
      if (fontObj?.color?.argb) fgColor = argbToRgb(fontObj.color.argb)
      const hAlign = (cell.alignment?.horizontal ?? 'center').toUpperCase()
      cells.push({ bg, bold, fontSize, fgColor, hAlign })
    }

    // Batch consecutive cells with same formatting
    let ci = 0
    while (ci < cells.length) {
      const fmt = cells[ci]
      let end = ci + 1
      while (end < cells.length &&
        JSON.stringify(cells[end]) === JSON.stringify(fmt)) end++

      reqs.push({ repeatCell: {
        range: { sheetId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: ci, endColumnIndex: end },
        cell: { userEnteredFormat: {
          backgroundColor: fmt.bg,
          textFormat: { bold: fmt.bold, fontSize: fmt.fontSize, foregroundColor: fmt.fgColor },
          horizontalAlignment: fmt.hAlign,
        }},
        fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment',
      }})
      ci = end
    }
  }

  // Merges from template
  for (const m of merges) {
    if (m.r1 - m.r0 < 1 || m.c1 - m.c0 < 1) continue
    reqs.push({ mergeCells: { range: { sheetId, startRowIndex: m.r0, endRowIndex: m.r1, startColumnIndex: m.c0, endColumnIndex: m.c1 }, mergeType: 'MERGE_ALL' } })
  }

  // Freeze panes from template worksheet view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const views: any[] = (ws as any).views ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frozenView = views.find((v: any) => v.state === 'frozen')
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: frozenView?.ySplit ?? 3, frozenColumnCount: frozenView?.xSplit ?? 2 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

  // Row heights from template (Excel row height is in points; 1pt ≈ 1.333px)
  for (let ri = 1; ri <= ws.rowCount; ri++) {
    const rowObj = ws.getRow(ri)
    if (rowObj.height) {
      const px = Math.max(15, Math.round(rowObj.height * 1.333))
      reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: ri - 1, endIndex: ri }, properties: { pixelSize: px }, fields: 'pixelSize' } })
    }
  }

  // Column widths from template (ExcelJS width ≈ characters; 1 char ≈ 7.5px + padding)
  for (const { col, px } of colWidths) {
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  }

  // Batch in chunks of 1000 to stay within API limits
  for (let i = 0; i < reqs.length; i += 1000) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs.slice(i, i + 1000) } })
  }
}

async function applySheetFormatting(
  sheets: SheetsAPI,
  spreadsheetId: string,
  sheetId: number,
  daysCount: number,
  N: number,
  foodLen: number,
  packLen: number,
  miscLen: number,
  BASE: number,
): Promise<void> {
  const COL_AFTER_DEDUCT = BASE
  const COL_CK           = BASE + 3
  const COL_REVENUE      = BASE + 5
  const COL_SPACER       = BASE + 6
  const COL_TOTAL        = BASE + 7
  const COL_FOOD_SUB     = BASE + 8
  const COL_PACK_SUB     = BASE + 9
  const COL_MISC_SUB     = BASE + 10
  const COL_FOOD_START   = BASE + 11
  const COL_PACK_START   = COL_FOOD_START + foodLen
  const COL_MISC_START   = COL_PACK_START + packLen
  const TOTAL_COLS       = COL_MISC_START + miscLen
  const dataEnd          = 4 + daysCount  // row index after last day

  const C = {
    FFFFCC: hex('FFFFCC'), FFFF00: hex('FFFF00'), BFBFBF: hex('BFBFBF'),
    FFC000: hex('FFC000'), DA9694: hex('DA9694'), GREEN:  hex('00B050'),
    C6D9F0: hex('C6D9F0'), FBD4B4: hex('FBD4B4'), FDE9D9: hex('FDE9D9'),
    F79544: hex('F79544'), WHITE:  hex('FFFFFF'), E8E8E8: hex('E8E8E8'),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqs: any[] = []

  function rc(r0: number, r1: number, c0: number, c1: number, bg?: RGB, bold?: boolean) {
    if (c0 >= c1) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmt: any = {}
    const fields: string[] = ['userEnteredFormat.horizontalAlignment']
    fmt.horizontalAlignment = 'CENTER'
    if (bg)            { fmt.backgroundColor = bg;           fields.push('userEnteredFormat.backgroundColor') }
    if (bold !== undefined) { fmt.textFormat = { bold, fontSize: 10 }; fields.push('userEnteredFormat.textFormat.bold', 'userEnteredFormat.textFormat.fontSize') }
    reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: fmt }, fields: fields.join(',') } })
  }

  function mg(r0: number, r1: number, c0: number, c1: number) {
    if (c1 - c0 < 2) return
    reqs.push({ mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } })
  }

  // ── Row 1: vendor group header row ──
  rc(0, 1, 0, COL_REVENUE + 1, C.FFFFCC, true)
  rc(0, 1, COL_SPACER, COL_SPACER + 1, C.E8E8E8)
  rc(0, 1, COL_TOTAL,    COL_TOTAL + 1,    C.BFBFBF, true)
  rc(0, 1, COL_FOOD_SUB, COL_FOOD_SUB + 1, C.FFFF00, true)
  rc(0, 1, COL_PACK_SUB, COL_MISC_SUB + 1, C.BFBFBF, true)
  // Vendor colors (food cols)
  rc(0, 1, COL_FOOD_START,     Math.min(COL_FOOD_START + 6,  COL_FOOD_START + foodLen), C.WHITE,   true)
  rc(0, 1, COL_FOOD_START + 6, Math.min(COL_FOOD_START + 7,  COL_FOOD_START + foodLen), C.DA9694,  true)
  rc(0, 1, COL_FOOD_START + 7, Math.min(COL_FOOD_START + 8,  COL_FOOD_START + foodLen), C.C6D9F0,  true)
  rc(0, 1, COL_FOOD_START + 8, Math.min(COL_FOOD_START + 17, COL_FOOD_START + foodLen), C.FDE9D9,  true)
  rc(0, 1, Math.min(COL_FOOD_START + 17, COL_PACK_START), COL_PACK_START, C.FBD4B4, true)
  rc(0, 1, COL_PACK_START, COL_MISC_START, C.C6D9F0, true)
  rc(0, 1, COL_MISC_START, Math.min(COL_MISC_START + 13, TOTAL_COLS), C.C6D9F0, true)
  rc(0, 1, Math.min(COL_MISC_START + 13, TOTAL_COLS), TOTAL_COLS, C.FBD4B4, true)
  // Merges row 1
  mg(0, 1, COL_FOOD_START, Math.min(COL_FOOD_START + 6, COL_PACK_START))
  mg(0, 1, COL_FOOD_START + 8, Math.min(COL_FOOD_START + 17, COL_PACK_START))
  mg(0, 1, Math.min(COL_FOOD_START + 17, COL_PACK_START), COL_PACK_START)
  mg(0, 1, COL_PACK_START, COL_MISC_START)
  mg(0, 1, COL_MISC_START, Math.min(COL_MISC_START + 13, TOTAL_COLS))
  mg(0, 1, Math.min(COL_MISC_START + 13, TOTAL_COLS), TOTAL_COLS)

  // ── Row 2: 總發票/總收據 ──
  rc(1, 2, 0, COL_REVENUE + 1, C.FFFFCC, true)
  rc(1, 2, COL_SPACER, COL_SPACER + 1, C.E8E8E8)
  rc(1, 2, COL_TOTAL,    COL_TOTAL + 1,    C.BFBFBF, true)
  rc(1, 2, COL_FOOD_SUB, COL_FOOD_SUB + 1, C.FFFF00, true)
  rc(1, 2, COL_PACK_SUB, COL_PACK_SUB + 1, C.BFBFBF, true)
  rc(1, 2, COL_MISC_SUB, COL_MISC_SUB + 1, C.FFFF00, true)
  rc(1, 2, COL_FOOD_START, TOTAL_COLS, C.BFBFBF, false)

  // ── Row 3: column headers ──
  rc(2, 3, 0, 2, C.BFBFBF, true)
  rc(2, 3, 2, 3, C.FFC000, true)
  rc(2, 3, 3, 4, C.DA9694, true)
  for (let i = 0; i < N; i++) rc(2, 3, 4 + i, 5 + i, C.GREEN, true)
  for (let c = COL_AFTER_DEDUCT; c <= COL_REVENUE; c++) {
    rc(2, 3, c, c + 1, c === COL_CK ? C.FFFF00 : C.FFC000, true)
  }
  rc(2, 3, COL_SPACER,   COL_SPACER + 1,   C.E8E8E8, false)
  rc(2, 3, COL_TOTAL,    COL_TOTAL + 1,    C.BFBFBF, true)
  rc(2, 3, COL_FOOD_SUB, COL_FOOD_SUB + 1, C.BFBFBF, true)
  rc(2, 3, COL_PACK_SUB, COL_PACK_SUB + 1, C.BFBFBF, true)
  rc(2, 3, COL_MISC_SUB, COL_MISC_SUB + 1, C.BFBFBF, true)
  rc(2, 3, COL_FOOD_START, TOTAL_COLS, C.BFBFBF, true)

  // ── Row 4: monthly totals (yellow) ──
  rc(3, 4, 0, TOTAL_COLS, C.FFFF00, true)

  // ── Rows 5+: daily data ──
  rc(4, dataEnd, 0, COL_REVENUE + 1, C.FFFFCC, false)
  rc(4, dataEnd, COL_SPACER, COL_SPACER + 1, C.E8E8E8, false)
  rc(4, dataEnd, COL_TOTAL,    COL_TOTAL + 1,    C.WHITE,   false)
  rc(4, dataEnd, COL_FOOD_SUB, COL_FOOD_SUB + 1, C.F79544,  false)
  rc(4, dataEnd, COL_PACK_SUB, COL_PACK_SUB + 1, C.C6D9F0,  false)
  rc(4, dataEnd, COL_MISC_SUB, COL_MISC_SUB + 1, C.F79544,  false)
  rc(4, dataEnd, COL_FOOD_START, COL_PACK_START, C.WHITE,   false)
  rc(4, dataEnd, COL_PACK_START, COL_MISC_START, C.C6D9F0,  false)
  rc(4, dataEnd, COL_MISC_START, Math.min(COL_MISC_START + 13, TOTAL_COLS), C.C6D9F0, false)
  rc(4, dataEnd, Math.min(COL_MISC_START + 13, TOTAL_COLS), TOTAL_COLS, C.FBD4B4, false)

  // ── Freeze rows 1-3, cols A-B ──
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 2 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

  // ── Row heights ──
  for (const [idx, px] of [[0,24],[1,21],[2,26],[3,24]] as [number,number][]) {
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  }

  // ── Column widths ──
  const colWidths: [number, number, number][] = [ // [start, end, px]
    [0, 1, 90], [1, 2, 50],
    [2, 3, 60], [3, 4, 60],
    ...(Array.from({ length: N }, (_, i) => [4 + i, 5 + i, 60] as [number,number,number])),
    [COL_AFTER_DEDUCT, COL_AFTER_DEDUCT+1, 70],
    [BASE+1, BASE+2, 60], [BASE+2, BASE+3, 60], [BASE+3, BASE+4, 80], [BASE+4, BASE+5, 60], [BASE+5, BASE+6, 70],
    [COL_SPACER, COL_SPACER+1, 15],
  ]
  // Default all item columns to 55px first
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: COL_TOTAL, endIndex: TOTAL_COLS }, properties: { pixelSize: 55 }, fields: 'pixelSize' } })
  for (const [s, e, px] of colWidths) {
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: s, endIndex: e }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs } })
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
