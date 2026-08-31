import 'server-only'

import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractValues, extractColWidths, extractMerges } from '@/lib/food-cost-template'
import { buildFoodCostNativeWorkbook } from '@/lib/food-cost-native-workbook'
import { type CKDayData, fillCKWorksheet, buildCKGeneratedWorkbook, ckTemplateHasStoreColumns, getDaysInMonth } from '@/lib/ck-template'
import { getMonthLastDay } from '@/lib/business-date'

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

export async function syncClosingToSheets(closingId: string): Promise<void> {
  const admin = createAdminClient()

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

  const { data: store } = await admin
    .from('stores')
    .select('name, google_sheets_id')
    .eq('id', storeId)
    .single()

  const sheetsId = store?.google_sheets_id as string | null
  if (!sheetsId) return

  const workbook = await buildFoodCostNativeWorkbook(storeId, year, monthNum)
  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: sheetsId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
  })

  for (const worksheet of workbook.worksheets) {
    const tabName = `${year}年${worksheet.name}`
    const existing = spreadsheet.data.sheets?.find(sheet => sheet.properties?.title === tabName)
    let sheetId = existing?.properties?.sheetId
    let gridRowCount = existing?.properties?.gridProperties?.rowCount ?? 0
    let gridColumnCount = existing?.properties?.gridProperties?.columnCount ?? 0
    const requiredRows = Math.max(worksheet.rowCount, 1)
    const requiredColumns = Math.max(worksheet.columnCount, 1)

    if (sheetId == null) {
      const added = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetsId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  rowCount: Math.max(requiredRows, 100),
                  columnCount: Math.max(requiredColumns, 26),
                },
              },
            },
          }],
        },
      })
      const properties = added.data.replies?.[0]?.addSheet?.properties
      sheetId = properties?.sheetId
      gridRowCount = properties?.gridProperties?.rowCount ?? Math.max(requiredRows, 100)
      gridColumnCount = properties?.gridProperties?.columnCount ?? Math.max(requiredColumns, 26)
    } else if (gridRowCount < requiredRows || gridColumnCount < requiredColumns) {
      gridRowCount = Math.max(gridRowCount, requiredRows)
      gridColumnCount = Math.max(gridColumnCount, requiredColumns)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetsId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  rowCount: gridRowCount,
                  columnCount: gridColumnCount,
                },
              },
              fields: 'gridProperties.rowCount,gridProperties.columnCount',
            },
          }],
        },
      })
    }

    if (sheetId == null) throw new Error(`無法建立 Google 試算表分頁：${tabName}`)

    // Values cannot be pasted into a range that only partially overlaps an old
    // merge, so remove the previous layout before writing the native workbook.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetsId,
      requestBody: {
        requests: [{
          unmergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: gridRowCount,
              startColumnIndex: 0,
              endColumnIndex: gridColumnCount,
            },
          },
        }],
      },
    })

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetsId,
      range: `'${tabName.replace(/'/g, "''")}'`,
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetsId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: extractValues(worksheet) },
    })

    await applyTemplateFormatting(
      sheets,
      sheetsId,
      sheetId,
      extractColWidths(worksheet),
      extractMerges(worksheet),
      worksheet,
      gridRowCount,
      gridColumnCount,
    )
    await writeWorksheetNotes(
      sheets,
      sheetsId,
      sheetId,
      worksheet,
      gridRowCount,
      gridColumnCount,
    )

    console.log(
      `[syncClosingToSheets] ${store?.name ?? storeId} ${year}-${String(monthNum).padStart(2, '0')} → sheet "${tabName}" done (native workbook)`,
    )
  }
}
type SheetsAPI = ReturnType<typeof google.sheets>
type RGB = { red: number; green: number; blue: number }

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
  colWidths: Array<{ col: number; px: number; hidden?: boolean }>,
  merges: Array<{ r0: number; r1: number; c0: number; c1: number }>,
  ws: ExcelJS.Worksheet,
  gridRowCount = Math.max(ws.rowCount, 1),
  gridColumnCount = Math.max(ws.columnCount, 1),
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqs: any[] = []

  const maxRow = Math.max(ws.rowCount, 1)
  const maxCol = Math.max(ws.columnCount, 1)

  // Remove formatting and merges left behind by an older sync before applying the
  // current native workbook. Resetting the entire tab also handles a workbook
  // that became smaller since the previous sync.
  reqs.push({ unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: gridRowCount, startColumnIndex: 0, endColumnIndex: gridColumnCount } } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: gridRowCount, startColumnIndex: 0, endColumnIndex: gridColumnCount }, cell: { userEnteredFormat: {} }, fields: 'userEnteredFormat' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: gridColumnCount }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: gridRowCount }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })

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
  type CellFmt = {
    bg: RGB
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
    fontFamily?: string
    fontSize: number
    fgColor: RGB
    hAlign: string
    vAlign: string
    wrapStrategy: string
    borders: any
    numFmt: string
  }
  for (let r = 1; r <= maxRow; r++) {
    const rowObj = ws.getRow(r)
    const cells: CellFmt[] = []
    for (let c = 1; c <= maxCol; c++) {
      const cell = rowObj.getCell(c)
      const bg = getBg(cell, rowObj)
      const fontObj = cell.font
      const bold = fontObj?.bold ?? false
      const italic = fontObj?.italic ?? false
      const underline = Boolean(fontObj?.underline)
      const strikethrough = fontObj?.strike ?? false
      const fontFamily = fontObj?.name
      const fontSize = fontObj?.size ?? 10
      let fgColor: RGB = { red: 0, green: 0, blue: 0 }
      if (fontObj?.color?.argb) fgColor = argbToRgb(fontObj.color.argb)
      const horizontal = cell.alignment?.horizontal
      const hAlign = horizontal === 'left' || horizontal === 'right' || horizontal === 'center'
        ? horizontal.toUpperCase()
        : 'CENTER'
      const vertical = cell.alignment?.vertical
      const vAlign = vertical === 'top' || vertical === 'bottom' || vertical === 'middle'
        ? vertical.toUpperCase()
        : 'MIDDLE'
      const wrapStrategy = cell.alignment?.wrapText ? 'WRAP' : 'OVERFLOW_CELL'
      const borderObj = cell.border as any
      const borders: any = {}
      if (borderObj?.top)    borders.top    = cvtBorder(borderObj.top)
      if (borderObj?.bottom) borders.bottom = cvtBorder(borderObj.bottom)
      if (borderObj?.left)   borders.left   = cvtBorder(borderObj.left)
      if (borderObj?.right)  borders.right  = cvtBorder(borderObj.right)
      const numFmt = cell.numFmt ?? ''
      cells.push({ bg, bold, italic, underline, strikethrough, fontFamily, fontSize, fgColor, hAlign, vAlign, wrapStrategy, borders, numFmt })
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
        textFormat: {
          bold: fmt.bold,
          italic: fmt.italic,
          underline: fmt.underline,
          strikethrough: fmt.strikethrough,
          fontFamily: fmt.fontFamily,
          fontSize: fmt.fontSize,
          foregroundColor: fmt.fgColor,
        },
        horizontalAlignment: fmt.hAlign,
        verticalAlignment: fmt.vAlign,
        wrapStrategy: fmt.wrapStrategy,
      }
      const fields = 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy'
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

  // Row heights from workbook (Excel row height is in points; 1pt ≈ 1.333px)
  const defaultRowHeight = Math.max(15, Math.round((ws.properties.defaultRowHeight ?? 15) * 1.333))
  for (let ri = 1; ri <= ws.rowCount; ri++) {
    const rowObj = ws.getRow(ri)
    const px = rowObj.height ? Math.max(15, Math.round(rowObj.height * 1.333)) : defaultRowHeight
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: ri - 1, endIndex: ri }, properties: { pixelSize: px }, fields: 'pixelSize' } })
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

function worksheetNoteText(note: ExcelJS.Cell['note']): string | null {
  if (typeof note === 'string') return note
  if (!note || !('texts' in note) || !Array.isArray(note.texts)) return null
  return note.texts.map(part => part.text).join('')
}

async function writeWorksheetNotes(
  sheets: SheetsAPI,
  spreadsheetId: string,
  sheetId: number,
  ws: ExcelJS.Worksheet,
  gridRowCount: number,
  gridColumnCount: number,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqs: any[] = [{
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: gridRowCount, startColumnIndex: 0, endColumnIndex: gridColumnCount },
      cell: { note: null },
      fields: 'note',
    },
  }]

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const note = worksheetNoteText(cell.note)
      if (!note) return
      reqs.push({
        updateCells: {
          range: {
            sheetId,
            startRowIndex: rowNumber - 1,
            endRowIndex: rowNumber,
            startColumnIndex: columnNumber - 1,
            endColumnIndex: columnNumber,
          },
          rows: [{ values: [{ note }] }],
          fields: 'note',
        },
      })
    })
  })

  for (let i = 0; i < reqs.length; i += 1000) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs.slice(i, i + 1000) } })
  }
}

// Sync an entire month directly by storeId + month (for manual re-sync of historical data)
export async function syncMonthToSheets(storeId: string, month: string): Promise<void> {
  const admin = createAdminClient()
  const [yearStr, monthStr] = month.split('-')
  const firstDay = `${month}-01`
  const lastDay = getMonthLastDay(parseInt(yearStr), parseInt(monthStr))

  const { data: store } = await admin
    .from('stores')
    .select('google_sheets_id')
    .eq('id', storeId)
    .maybeSingle()
  if (!store) throw new Error('找不到店家')
  if (!store.google_sheets_id) {
    throw new Error('此店家尚未綁定 Google 試算表（請至「店家管理」設定試算表 ID）')
  }

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
  const [{ data: storeOrders }, { data: expenseItems }] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

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
      const name = (o as AnyRecord).store_id
        ? storeNameMap[(o as AnyRecord).store_id] ?? (o as AnyRecord).store_id
        : (o as AnyRecord).external_store_name
      const amount = (o as AnyRecord).store_id
        ? Number((o as AnyRecord).ck_confirmed_amount ?? 0)
        : Number((o as AnyRecord).amount ?? 0)
      if (name) storeRevenues[name] = (storeRevenues[name] ?? 0) + amount
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

  const assignedStoreNames = assignedIds.map(id => storeNameMap[id]).filter(Boolean)
  const externalStoreNames = [...new Set(
    Object.values(dataMap).flatMap(day => Object.keys(day.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name)),
  )]
  const requiredStoreNames = [...assignedStoreNames, ...externalStoreNames]

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
      if (ws && ckTemplateHasStoreColumns(ws, requiredStoreNames)) {
        const filled = fillCKWorksheet(ws, days, dataMap)
        if (filled) usedTemplate = true
      } else if (ws) {
        console.warn('[syncCKMonthToSheets] template store columns are outdated; using generated workbook')
      }
    }
  } catch (e) { console.warn('[syncCKMonthToSheets] template load failed:', e) }

  if (!usedTemplate) {
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
      await applyTemplateFormatting(sheets, sheetsId, sheetId, wsWidths, wsMerges, ws)
    } catch (fmtErr) {
      console.warn('[syncCKMonthToSheets] template formatting failed (data already written):', fmtErr)
    }
  }
  console.log(`[syncCKMonthToSheets] ${ckStore.name} ${month} → sheet "${tabName}" done (${usedTemplate ? 'template' : 'generated'})`)
}
