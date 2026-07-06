import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { type RowVals, fillWorksheet, extractValues, extractColors, extractBold, extractColWidths, extractMerges } from '@/lib/food-cost-template'
import { type CKDayData, fillCKWorksheet, buildCKGeneratedWorkbook, getDaysInMonth } from '@/lib/ck-template'
import { getMonthLastDay } from '@/lib/business-date'

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
  panda: number; online: number; online_cash: number
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
  const lastDay = getMonthLastDay(year, monthNum)

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
      .select('item_name, excel_column, item_category, store_id, vendor_group')
      .or(`store_id.is.null,store_id.eq.${storeId}`),
    admin.from('central_kitchen_prices').select('item_name, excel_column').eq('active', true),
  ])

  const mappingLookup: Record<string, string> = {}
  const categoryLookup: Record<string, string> = {}
  const vendorGroupLookup: Record<string, string> = {}
  for (const m of (mappingsRaw ?? []).filter((m: AnyRecord) => !m.store_id)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
    if (m.vendor_group) { vendorGroupLookup[m.item_name] = m.vendor_group; vendorGroupLookup[m.excel_column] = m.vendor_group }
  }
  for (const m of (mappingsRaw ?? []).filter((m: AnyRecord) => m.store_id === storeId)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
    if (m.vendor_group) { vendorGroupLookup[m.item_name] = m.vendor_group; vendorGroupLookup[m.excel_column] = m.vendor_group }
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
    if (!byDate[d]) byDate[d] = { items: {}, notes: {}, pos: 0, twpay: 0, panda: 0, online: 0, online_cash: 0, uber: {}, onsite: 0, actual: 0, ck: 0, revenue: 0, variance: 0 }
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
    for (const it of validItems) {
      const vg = vendorGroupLookup[it.item_name]
      const key = (vg && it.item_name !== it.resolved_col)
        ? `_col_${vg}_${it.resolved_col}`
        : it.resolved_col
      dd.items[key] = (dd.items[key] || 0) + (it.amount as number)
    }
    if ((r.notes as string)?.trim() && validItems.length > 0) {
      const noteText = (r.notes as string).trim()
      for (const it of validItems) {
        const vg = vendorGroupLookup[it.item_name]
        const key = (vg && it.item_name !== it.resolved_col)
          ? `_col_${vg}_${it.resolved_col}`
          : it.resolved_col
        dd.notes[key] = dd.notes[key] ? `${dd.notes[key]}\n${noteText}` : noteText
      }
    }
    const taxAmt = (r.tax_amount ?? 0) as number
    if (taxAmt > 0 && positiveItems.length > 0) {
      const hasPackItem = positiveItems.some((it: AnyRecord) =>
        categoryLookup[it.item_name] === '耗材' || packCols.includes(it.resolved_col)
      )
      if (hasPackItem) {
        dd.items['免洗稅金'] = (dd.items['免洗稅金'] || 0) + taxAmt
      } else {
        const vg = positiveItems
          .map((it: AnyRecord) => vendorGroupLookup[it.item_name] ?? vendorGroupLookup[it.resolved_col])
          .find(Boolean)
        const itemNames = [...new Set(positiveItems.map((it: AnyRecord) => it.item_name as string).filter(Boolean))].join('|')
        const taxKey = vg ? `_tax_${vg}::${itemNames}` : '稅金'
        dd.items[taxKey] = (dd.items[taxKey] || 0) + taxAmt
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
    let handwriteSum = 0
    for (const rv of (c.revenue_items as AnyRecord[]) ?? []) {
      // POS 欄只記實際的 POS channel；handwrite 走 onsite
      if (rv.channel === 'pos') dd.pos += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'handwrite') handwriteSum += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'twpay') dd.twpay  += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'panda') dd.panda  += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'online') dd.online += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'online_cash') dd.online_cash += (rv.gross_amount ?? 0) as number
      if (rv.channel === 'uber' && rv.account_name) {
        dd.uber[rv.account_name as string] = (dd.uber[rv.account_name as string] || 0) + ((rv.gross_amount ?? 0) as number)
      }
    }
    const uberSum = Object.values(dd.uber).reduce((s, v) => s + v, 0)
    dd.onsite = (ichefLinked ? (dd.pos - uberSum - dd.twpay - dd.panda - dd.online) : dd.pos) + handwriteSum
    let ckItemsSum = 0
    let ckSummarySum = 0
    for (const oi of (c.order_items as AnyRecord[]) ?? []) {
      if (oi.item_name === '央廚配送') {
        ckSummarySum += (oi.total_amount ?? 0) as number
      } else {
        const excelCol = mappingLookup[oi.item_name] ?? ckColLookup[oi.item_name] ?? oi.item_name
        if (excelCol && (oi.total_amount || 0) > 0) {
          dd.items[excelCol] = (dd.items[excelCol] || 0) + (oi.total_amount as number)
        }
        if ((oi.item_name in ckColLookup) && (oi.total_amount || 0) > 0) ckItemsSum += oi.total_amount as number
      }
    }
    dd.ck = ckSummarySum > 0 ? ckSummarySum : ckItemsSum
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  )

  const dataRows: Array<{ date: string; row: RowVals }> = days.map(date => {
    const d = byDate[date]
    const pos      = d?.pos ?? 0
    const twpay    = d?.twpay ?? 0
    const panda    = d?.panda ?? 0
    const online   = d?.online ?? 0
    const online_cash = d?.online_cash ?? 0
    const uber     = d?.uber ?? {}
    const onsite   = d?.onsite ?? 0
    const actual   = d?.actual ?? 0
    const ck       = d?.ck ?? 0
    const variance = d?.variance ?? 0
    const after_deduct = actual - ck - variance
    const computedRevenue = onsite + variance
    const totalRevenue = d?.revenue ?? 0
    const items = d?.items ?? {}
    const foodTotal = foodCols.reduce((s, col) => s + (items[col] || 0), 0)
    const packTotal = packCols.reduce((s, col) => s + (items[col] || 0), 0)
    const miscTotal = miscCols.reduce((s, col) => s + (items[col] || 0), 0)
    const notes = d?.notes ?? {}
    return { date, row: { pos, twpay, panda, online, online_cash, uber, after_deduct, onsite, actual, ck, result: variance, revenue: computedRevenue, totalRevenue, items, notes, foodTotal, packTotal, miscTotal, grandTotal: foodTotal + packTotal + miscTotal } }
  })

  const sumOf = (fn: (r: RowVals) => number) => dataRows.reduce((s, { row }) => s + fn(row), 0)
  const totals: RowVals = {
    pos:          sumOf(r => r.pos),
    twpay:        sumOf(r => r.twpay),
    panda:        sumOf(r => r.panda),
    online:       sumOf(r => r.online),
    online_cash:  sumOf(r => r.online_cash ?? 0),
    uber:         Object.fromEntries(uberAccounts.map(acc => [acc, dataRows.reduce((s, { row }) => s + (row.uber[acc] ?? 0), 0)])),
    after_deduct: sumOf(r => r.after_deduct),
    onsite:       sumOf(r => r.onsite),
    actual:       sumOf(r => r.actual),
    ck:           sumOf(r => r.ck),
    result:       sumOf(r => r.result),
    revenue:      sumOf(r => r.revenue),
    totalRevenue: dataRows.reduce((s, { row }) => s + (row.totalRevenue ?? 0), 0),
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
        const filled = await fillWorksheet(ws, days, dataRows, uberAccounts, vendorGroupLookup)
        if (filled) {
          const wsValues = extractValues(ws)
          const wsWidths = extractColWidths(ws)
          const wsMerges = extractMerges(ws)
          const hiddenCols = wsWidths.filter(w => w.hidden)
          console.log(`[syncClosingToSheets] v2 wsWidths=${wsWidths.length} hiddenCols=${hiddenCols.length} (${hiddenCols.map(h=>h.col).join(',')})`)

          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetsId,
            range: `'${tabName}'!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: wsValues.map(row => row.map(v => v ?? '')) },
          })
          // Mark template used BEFORE formatting so a formatting error never discards the data
          usedTemplate = true
          console.log(`[syncClosingToSheets] ${storeName} ${year}-${String(monthNum).padStart(2, '0')} → sheet "${tabName}" data written (template)`)

          try {
            await applyTemplateFormatting(sheets, sheetsId, sheetId, [], [], wsWidths, wsMerges, ws)
            console.log(`[syncClosingToSheets] ${storeName} ${year}-${String(monthNum).padStart(2, '0')} → formatting applied`)
          } catch (fmtErr) {
            console.warn('[syncClosingToSheets] template formatting failed (data already written):', fmtErr)
          }
          // Write cell notes (annotations) from the filled worksheet
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const noteReqs: any[] = []
            const dataStart0 = filled.dataStartRow - 1  // convert to 0-based row index
            // Clear stale notes in the data range first
            noteReqs.push({ repeatCell: { range: { sheetId, startRowIndex: dataStart0, endRowIndex: dataStart0 + days.length, startColumnIndex: 0, endColumnIndex: ws.columnCount || 100 }, cell: { note: '' }, fields: 'note' } })
            for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
              const excelRowNum = filled.dataStartRow + dayIdx  // 1-based ExcelJS row
              ws.getRow(excelRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
                if (!cell.note) return
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawNote = cell.note as any
                const noteText = typeof rawNote === 'string' ? rawNote : (rawNote.texts?.map((t: any) => t.text ?? '').join('') ?? '')
                if (!noteText.trim()) return
                noteReqs.push({ updateCells: { range: { sheetId, startRowIndex: excelRowNum - 1, endRowIndex: excelRowNum, startColumnIndex: colNum - 1, endColumnIndex: colNum }, rows: [{ values: [{ note: noteText }] }], fields: 'note' } })
              })
            }
            if (noteReqs.length > 1) {
              for (let ni = 0; ni < noteReqs.length; ni += 1000) {
                await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetsId, requestBody: { requests: noteReqs.slice(ni, ni + 1000) } })
              }
            }
          } catch (noteErr) {
            console.warn('[syncClosingToSheets] failed to write cell notes:', noteErr)
          }
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
    // Write cell notes (annotations) for fallback layout
    try {
      const colKeyToIdx: Record<string, number> = {}
      foodCols.forEach((col, i) => { colKeyToIdx[col] = COL_FOOD_START + i })
      packCols.forEach((col, i) => { colKeyToIdx[col] = COL_PACK_START + i })
      miscCols.forEach((col, i) => { colKeyToIdx[col] = COL_MISC_START + i })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noteReqs: any[] = []
      // Clear stale notes in the data range first
      noteReqs.push({ repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 4 + days.length, startColumnIndex: 0, endColumnIndex: TOTAL_COLS }, cell: { note: '' }, fields: 'note' } })
      dataRows.forEach(({ row }, dayIdx) => {
        const rowIdx = 4 + dayIdx
        for (const [key, noteText] of Object.entries(row.notes)) {
          if (!noteText?.trim()) continue
          const colIdx = colKeyToIdx[key]
          if (colIdx === undefined) continue
          noteReqs.push({ updateCells: { range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 }, rows: [{ values: [{ note: noteText }] }], fields: 'note' } })
        }
      })
      if (noteReqs.length > 1) {
        for (let ni = 0; ni < noteReqs.length; ni += 1000) {
          await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetsId, requestBody: { requests: noteReqs.slice(ni, ni + 1000) } })
        }
      }
    } catch (noteErr) {
      console.warn('[syncClosingToSheets] failed to write cell notes (fallback):', noteErr)
    }
  }
}

type SheetsAPI = ReturnType<typeof google.sheets>
type RGB = { red: number; green: number; blue: number }

function hex(h: string): RGB {
  return { red: parseInt(h.slice(0,2),16)/255, green: parseInt(h.slice(2,4),16)/255, blue: parseInt(h.slice(4,6),16)/255 }
}

function inferNumFmtType(pattern: string): string {
  const stripped = pattern.replace(/"[^"]*"/g, '').toLowerCase()
  if (/[dy]/.test(stripped) || pattern.includes('月') || pattern.includes('日')) return 'DATE'
  if (/h/.test(stripped)) return 'TIME'
  if (stripped.includes('%')) return 'PERCENT'
  return 'NUMBER'
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
  colWidths: Array<{ col: number; px: number; hidden?: boolean }>,
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

  // Border style mapping from Excel to Sheets API
  const BORDER_STYLE: Record<string, string> = {
    thin: 'SOLID', medium: 'SOLID_MEDIUM', thick: 'SOLID_THICK',
    double: 'DOUBLE', dotted: 'DOTTED', dashed: 'DASHED', hair: 'SOLID',
    mediumDashed: 'SOLID_MEDIUM', dashDot: 'DASHED', mediumDashDot: 'SOLID_MEDIUM',
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cvtBorder(b: any) {
    if (!b?.style) return undefined
    return { style: BORDER_STYLE[b.style] ?? 'SOLID', color: b.color?.argb ? argbToRgb(b.color.argb as string) : { red: 0, green: 0, blue: 0 } }
  }

  // Extract background with row-style fallback (Excel allows row-level default fills)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getBg(cell: ExcelJS.Cell, rowObj: ExcelJS.Row): RGB {
    const c = cell.fill as any
    if (c?.type === 'pattern' && c.pattern !== 'none' && c.fgColor?.argb) return argbToRgb(c.fgColor.argb as string)
    const r = rowObj.fill as any
    if (r?.type === 'pattern' && r.pattern !== 'none' && r.fgColor?.argb) return argbToRgb(r.fgColor.argb as string)
    return { red: 1, green: 1, blue: 1 }
  }

  // Apply per-cell formatting extracted directly from the worksheet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type CellFmt = { bg: RGB; bold: boolean; fontSize: number; fgColor: RGB; hAlign: string; borders: any; numFmt: string }
  for (let r = 1; r <= maxRow; r++) {
    const rowObj = ws.getRow(r)
    const cells: CellFmt[] = []
    for (let c = 1; c <= maxCol; c++) {
      const cell = rowObj.getCell(c)
      const bg = getBg(cell, rowObj)
      const fontObj = cell.font
      const bold = fontObj?.bold ?? false
      const fontSize = fontObj?.size ?? 10
      let fgColor: RGB = { red: 0, green: 0, blue: 0 }
      if (fontObj?.color?.argb) fgColor = argbToRgb(fontObj.color.argb)
      const hAlign = (cell.alignment?.horizontal ?? 'center').toUpperCase()
      const borderObj = cell.border as any
      const borders: any = {}
      if (borderObj?.top)    borders.top    = cvtBorder(borderObj.top)
      if (borderObj?.bottom) borders.bottom = cvtBorder(borderObj.bottom)
      if (borderObj?.left)   borders.left   = cvtBorder(borderObj.left)
      if (borderObj?.right)  borders.right  = cvtBorder(borderObj.right)
      const numFmt = cell.numFmt ?? ''
      cells.push({ bg, bold, fontSize, fgColor, hAlign, borders, numFmt })
    }

    // Batch consecutive cells with identical formatting
    let ci = 0
    while (ci < cells.length) {
      const fmt = cells[ci]
      const key = JSON.stringify(fmt)
      let end = ci + 1
      while (end < cells.length && JSON.stringify(cells[end]) === key) end++

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uf: any = {
        backgroundColor: fmt.bg,
        textFormat: { bold: fmt.bold, fontSize: fmt.fontSize, foregroundColor: fmt.fgColor },
        horizontalAlignment: fmt.hAlign,
      }
      const fields = 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.horizontalAlignment'
      let flds = fields
      if (Object.keys(fmt.borders).length) { uf.borders = fmt.borders; flds += ',userEnteredFormat.borders' }
      if (fmt.numFmt) { uf.numberFormat = { type: inferNumFmtType(fmt.numFmt), pattern: fmt.numFmt }; flds += ',userEnteredFormat.numberFormat' }

      reqs.push({ repeatCell: { range: { sheetId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: ci, endColumnIndex: end }, cell: { userEnteredFormat: uf }, fields: flds } })
      ci = end
    }
  }

  // Freeze panes MUST be set before mergeCells to avoid "can't merge frozen and non-frozen rows"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const views: any[] = (ws as any).views ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frozenView = views.find((v: any) => v.state === 'frozen')
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: frozenView?.ySplit ?? 3, frozenColumnCount: frozenView?.xSplit ?? 2 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

  // Merges from template
  for (const m of merges) {
    if (m.r1 - m.r0 < 1 || m.c1 - m.c0 < 1) continue
    reqs.push({ mergeCells: { range: { sheetId, startRowIndex: m.r0, endRowIndex: m.r1, startColumnIndex: m.c0, endColumnIndex: m.c1 }, mergeType: 'MERGE_ALL' } })
  }

  // Row heights from template (Excel row height is in points; 1pt ≈ 1.333px)
  for (let ri = 1; ri <= ws.rowCount; ri++) {
    const rowObj = ws.getRow(ri)
    if (rowObj.height) {
      const px = Math.max(15, Math.round(rowObj.height * 1.333))
      reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: ri - 1, endIndex: ri }, properties: { pixelSize: px }, fields: 'pixelSize' } })
    }
  }

  // Column widths from template (ExcelJS width ≈ characters; 1 char ≈ 7.5px + padding)
  for (const { col, px, hidden } of colWidths) {
    if (hidden) {
      reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
    } else {
      reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
    }
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
  const lastDay = getMonthLastDay(parseInt(yearStr), parseInt(monthStr))

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

/**
 * Sync CK store's monthly data to Google Sheets.
 * Content mirrors `/api/export/ck` Excel output.
 */
export async function syncCKMonthToSheets(ckStoreId: string, month: string): Promise<void> {
  const admin = createAdminClient()
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  // CK store info
  const { data: ckStore } = await admin
    .from('stores').select('id, name, assigned_store_ids, google_sheets_id').eq('id', ckStoreId).single()
  if (!ckStore) throw new Error('找不到央廚店家')
  const sheetsId = (ckStore as AnyRecord).google_sheets_id as string | null
  if (!sheetsId) throw new Error('此央廚尚未綁定 Google 試算表（請至「店家管理」設定 google_sheets_id）')

  const assignedIds: string[] = (ckStore.assigned_store_ids as string[] | null) ?? []
  const { data: memberStores } = assignedIds.length > 0
    ? await admin.from('stores').select('id, name').in('id', assignedIds)
    : { data: [] }
  const storeNameMap = Object.fromEntries((memberStores ?? []).map((s: AnyRecord) => [s.id as string, s.name as string]))

  // Fetch CK records
  const { data: records } = await admin
    .from('ck_daily_records')
    .select('id, business_date')
    .eq('ck_store_id', ckStoreId)
    .gte('business_date', firstDay)
    .lte('business_date', lastDay)
  const recordIds = (records ?? []).map(r => r.id)
  const [{ data: storeOrders }, { data: expenseItems }, { data: validClosings }] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
    assignedIds.length > 0
      ? admin.from('daily_closings')
          .select('store_id, business_date')
          .in('store_id', assignedIds)
          .gte('business_date', firstDay)
          .lte('business_date', lastDay)
      : Promise.resolve({ data: [] }),
  ])
  const validClosingKeys = new Set(
    (validClosings ?? []).map((c: AnyRecord) => `${c.business_date}||${c.store_id}`)
  )

  // Build dataMap (mirrors /api/export/ck)
  // 預先 group by ck_daily_record_id 避免 O(N×M) 線性掃描
  const ordersByRecordId: Record<string, AnyRecord[]> = {}
  for (const o of (storeOrders ?? []) as AnyRecord[]) {
    const k = o.ck_daily_record_id as string
    if (!ordersByRecordId[k]) ordersByRecordId[k] = []
    ordersByRecordId[k].push(o)
  }
  const expsByRecordId: Record<string, AnyRecord[]> = {}
  for (const e of (expenseItems ?? []) as AnyRecord[]) {
    const k = e.ck_daily_record_id as string
    if (!expsByRecordId[k]) expsByRecordId[k] = []
    expsByRecordId[k].push(e)
  }
  const days = getDaysInMonth(year, monthNum)
  const dataMap: Record<string, CKDayData> = {}
  for (const record of records ?? []) {
    const date = record.business_date as string
    const orders = ordersByRecordId[record.id as string] ?? []
    const exps = expsByRecordId[record.id as string] ?? []

    const storeRevenues: Record<string, number> = {}
    for (const o of orders) {
      if ((o as AnyRecord).store_id && !validClosingKeys.has(`${date}||${(o as AnyRecord).store_id}`)) continue
      const name = (o as AnyRecord).store_id
        ? storeNameMap[(o as AnyRecord).store_id] ?? (o as AnyRecord).store_id
        : (o as AnyRecord).external_store_name
      if (name) storeRevenues[name] = (storeRevenues[name] ?? 0) + ((o as AnyRecord).amount as number)
    }

    const expenses: Record<string, number> = {}
    let foodTotal = 0, packTotal = 0, miscTotal = 0
    for (const e of exps) {
      const name = (e as AnyRecord).item_name as string
      const amt = (e as AnyRecord).amount as number
      expenses[name] = (expenses[name] ?? 0) + amt
      if ((e as AnyRecord).category === '食材') foodTotal += amt
      else if ((e as AnyRecord).category === '耗材') packTotal += amt
      else miscTotal += amt
    }
    const totalRevenue = Object.values(storeRevenues).reduce((s, v) => s + v, 0)
    const totalExpense = foodTotal + packTotal + miscTotal
    dataMap[date] = { storeRevenues, expenses, foodTotal, packTotal, miscTotal, totalRevenue, totalExpense }
  }

  // Build workbook (template if available, otherwise generated)
  let wb: ExcelJS.Workbook | null = null
  let ws: ExcelJS.Worksheet | null = null
  let usedTemplate = false
  try {
    const { data: tmpl } = await admin.storage.from('excel-templates').download(`ck-${ckStoreId}.xlsx`)
    if (tmpl) {
      wb = new ExcelJS.Workbook()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(Buffer.from(await tmpl.arrayBuffer()) as any)
      const targetName = `${monthNum}月食耗成本`
      ws = wb.getWorksheet(targetName)
        ?? wb.worksheets.find(s => s.name.includes('食耗'))
        ?? wb.worksheets[0]
      if (ws) {
        const filled = fillCKWorksheet(ws, days, dataMap)
        if (filled) usedTemplate = true
      }
    }
  } catch (e) { console.warn('[syncCKMonthToSheets] template load failed:', e) }

  if (!usedTemplate) {
    const assignedStoreNames = assignedIds.map(id => storeNameMap[id]).filter(Boolean)
    wb = buildCKGeneratedWorkbook(monthNum, days, dataMap, assignedStoreNames)
    ws = wb.worksheets[0]
  }
  if (!ws) throw new Error('無法建立工作表')

  const wsValues = extractValues(ws)
  const wsWidths = extractColWidths(ws)
  const wsMerges = extractMerges(ws)

  // Push to Google Sheets
  const tabName = `${year}年${monthNum}月食耗成本`
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

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

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: wsValues.map(row => row.map(v => v ?? '')) },
  })

  if (usedTemplate) {
    try {
      await applyTemplateFormatting(sheets, sheetsId, sheetId, [], [], wsWidths, wsMerges, ws)
    } catch (fmtErr) {
      console.warn('[syncCKMonthToSheets] template formatting failed (data already written):', fmtErr)
    }
  }
  console.log(`[syncCKMonthToSheets] ${ckStore.name} ${month} → sheet "${tabName}" done (${usedTemplate ? 'template' : 'generated'})`)
}
