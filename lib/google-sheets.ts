import 'server-only'

import { google } from 'googleapis'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractValues, extractColWidths, extractMerges } from '@/lib/food-cost-template'
import { buildFoodCostNativeWorkbook } from '@/lib/food-cost-native-workbook'
import { buildCKNativeWorkbook } from '@/lib/ck-native-workbook'

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
  await syncStoreMonthToSheetsImpl(storeId, businessDate.slice(0, 7), true)
}

/**
 * Sync a store month from the exact native workbook used by the Excel download.
 * This intentionally does not require an existing daily closing so a new month
 * can be created with its complete blank layout on the first day of the month.
 */
async function syncStoreMonthToSheetsImpl(
  storeId: string,
  month: string,
  allowUnbound: boolean,
): Promise<void> {
  const admin = createAdminClient()
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(year) || !Number.isInteger(monthNum)) {
    throw new Error('月份格式錯誤')
  }

  const { data: store } = await admin
    .from('stores')
    .select('name, google_sheets_id')
    .eq('id', storeId)
    .single()

  if (!store) throw new Error('找不到店家')
  const sheetsId = store?.google_sheets_id as string | null
  if (!sheetsId) {
    if (allowUnbound) return
    throw new Error('此店家尚未綁定 Google 試算表（請至「店家管理」設定試算表 ID）')
  }

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
    await writeDateColumnsAsText(sheets, sheetsId, tabName, worksheet)

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
      `[syncStoreMonthToSheets] ${store?.name ?? storeId} ${month} → sheet "${tabName}" done (native workbook)`,
    )
  }
}

export async function syncStoreMonthToSheets(storeId: string, month: string): Promise<void> {
  await syncStoreMonthToSheetsImpl(storeId, month, false)
}
type SheetsAPI = ReturnType<typeof google.sheets>
type RGB = { red: number; green: number; blue: number }

function columnNumberToA1(columnNumber: number): string {
  let result = ''
  let value = columnNumber
  while (value > 0) {
    value--
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

/**
 * USER_ENTERED is required for formulas, but it also makes Google Sheets parse
 * strings such as "8月1日" as dates. Rewrite only 日期 columns with RAW values so
 * their visible contents stay identical to the generated Excel workbook.
 */
async function writeDateColumnsAsText(
  sheets: SheetsAPI,
  spreadsheetId: string,
  tabName: string,
  ws: ExcelJS.Worksheet,
): Promise<void> {
  const escapedTabName = tabName.replace(/'/g, "''")
  const maxHeaderRow = Math.min(ws.rowCount, 10)
  for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber++) {
    const row = ws.getRow(rowNumber)
    for (let columnNumber = 1; columnNumber <= ws.columnCount; columnNumber++) {
      const header = row.getCell(columnNumber).text.replace(/[\s　]/g, '')
      if (header !== '日期') continue

      const values: string[][] = []
      for (let dataRow = rowNumber + 1; dataRow <= ws.rowCount; dataRow++) {
        const cell = ws.getRow(dataRow).getCell(columnNumber)
        values.push([cell.value == null ? '' : cell.text])
      }
      if (values.length === 0) continue

      const column = columnNumberToA1(columnNumber)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${escapedTabName}'!${column}${rowNumber + 1}:${column}${ws.rowCount}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      })
    }
  }
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
  let frozenRowCount = frozenView?.ySplit ?? 3
  let frozenColumnCount = frozenView?.xSplit ?? 2
  // Google Sheets rejects a merge that crosses a freeze boundary, although
  // Excel permits it. Preserve the workbook's merged layout and only remove
  // the conflicting freeze direction.
  if (merges.some(m => m.r0 < frozenRowCount && m.r1 > frozenRowCount)) frozenRowCount = 0
  if (merges.some(m => m.c0 < frozenColumnCount && m.c1 > frozenColumnCount)) frozenColumnCount = 0
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount, frozenColumnCount } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

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

// Backwards-compatible entry point used by the manual re-sync server action.
export async function syncMonthToSheets(storeId: string, month: string): Promise<void> {
  await syncStoreMonthToSheets(storeId, month)
}

/**
 * Sync CK store's monthly data to Google Sheets.
 * Content comes from the exact same native workbook builder used by the
 * user-facing `/api/export/ck-native` download.
 */
export async function syncCKMonthToSheets(ckStoreId: string, month: string): Promise<void> {
  const admin = createAdminClient()
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)

  const { data: ckStore } = await admin
    .from('stores').select('id, name, google_sheets_id').eq('id', ckStoreId).single()
  if (!ckStore) throw new Error('找不到央廚店家')
  const sheetsId = (ckStore as AnyRecord).google_sheets_id as string | null
  if (!sheetsId) throw new Error('此央廚尚未綁定 Google 試算表（請至「店家管理」設定 google_sheets_id）')

  const workbook = await buildCKNativeWorkbook(ckStoreId, year, monthNum)
  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: sheetsId,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))',
  })

  for (const [worksheetIndex, ws] of workbook.worksheets.entries()) {
    // Keep the existing main-tab name used by the business, while its contents
    // come directly from the native worksheet. Analysis tabs mirror Excel.
    const tabName = worksheetIndex === 0
      ? `${year}年${monthNum}月食耗成本`
      : `${year}年${ws.name}`
    const existing = spreadsheet.data.sheets?.find(sheet => sheet.properties?.title === tabName)
    let sheetId = existing?.properties?.sheetId
    let gridRowCount = existing?.properties?.gridProperties?.rowCount ?? 0
    let gridColumnCount = existing?.properties?.gridProperties?.columnCount ?? 0
    const requiredRows = Math.max(ws.rowCount, 1)
    const requiredColumns = Math.max(ws.columnCount, 1)

    if (sheetId == null) {
      const added = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetsId,
        requestBody: {
          requests: [{ addSheet: { properties: {
            title: tabName,
            gridProperties: {
              rowCount: Math.max(requiredRows, 100),
              columnCount: Math.max(requiredColumns, 26),
            },
          } } }],
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
        requestBody: { requests: [{
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount: gridRowCount, columnCount: gridColumnCount } },
            fields: 'gridProperties.rowCount,gridProperties.columnCount',
          },
        }] },
      })
    }
    if (sheetId == null) throw new Error(`無法建立 Google 試算表分頁：${tabName}`)

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetsId,
      requestBody: { requests: [{ unmergeCells: { range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: gridRowCount,
        startColumnIndex: 0,
        endColumnIndex: gridColumnCount,
      } } }] },
    })
    await sheets.spreadsheets.values.clear({ spreadsheetId: sheetsId, range: `'${tabName.replace(/'/g, "''")}'` })
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetsId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: extractValues(ws) },
    })
    await writeDateColumnsAsText(sheets, sheetsId, tabName, ws)
    await applyTemplateFormatting(
      sheets,
      sheetsId,
      sheetId,
      extractColWidths(ws),
      extractMerges(ws),
      ws,
      gridRowCount,
      gridColumnCount,
    )
    await writeWorksheetNotes(sheets, sheetsId, sheetId, ws, gridRowCount, gridColumnCount)
    console.log(`[syncCKMonthToSheets] ${ckStore.name} ${month} → sheet "${tabName}" done (native workbook)`)
  }
}

export type EnsureMonthSheetsResult = {
  month: string
  created: Array<{ storeId: string; storeName: string; type: string }>
  synced: Array<{ storeId: string; storeName: string; type: string }>
  existing: Array<{ storeId: string; storeName: string; type: string }>
  failed: Array<{ storeId: string; storeName: string; type: string; error: string }>
}

export type EnsureMonthSheetsOptions = {
  refreshExisting?: boolean
  type?: '店面' | '央廚'
}

export function getTaipeiCurrentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  if (!year || !month) throw new Error('無法取得台北時區月份')
  return `${year}-${month}`
}

/**
 * Ensure every active, bound store/central-kitchen spreadsheet has the current
 * month tab. Existing tabs are left untouched by the scheduled run. An
 * authenticated maintenance request can explicitly rebuild existing tabs from
 * the same native Excel workbook used by the download.
 */
export async function ensureMonthSheetsTabs(
  month = getTaipeiCurrentMonth(),
  options: EnsureMonthSheetsOptions = {},
): Promise<EnsureMonthSheetsResult> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式錯誤')

  const admin = createAdminClient()
  let storesQuery = admin
    .from('stores')
    .select('id, name, type, google_sheets_id')
    .eq('active', true)
    .not('google_sheets_id', 'is', null)
  if (options.type) storesQuery = storesQuery.eq('type', options.type)
  const { data: stores, error } = await storesQuery
  if (error) throw new Error(`讀取試算表設定失敗：${error.message}`)

  const [yearStr, monthStr] = month.split('-')
  const tabName = `${Number(yearStr)}年${Number(monthStr)}月食耗成本`
  const analysisTabName = `${Number(yearStr)}年${Number(monthStr)}月廠商分析`
  const sheets = google.sheets({ version: 'v4', auth: getAuth() })
  const result: EnsureMonthSheetsResult = { month, created: [], synced: [], existing: [], failed: [] }

  for (const store of stores ?? []) {
    const target = {
      storeId: String(store.id),
      storeName: String(store.name),
      type: String(store.type ?? '店面'),
    }
    try {
      const spreadsheetId = String(store.google_sheets_id ?? '').trim()
      if (!spreadsheetId) continue
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(title))',
      })
      const existingTitles = new Set(
        spreadsheet.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean) ?? [],
      )
      const hasCurrentTabs = existingTitles.has(tabName) && existingTitles.has(analysisTabName)
      if (hasCurrentTabs && !options.refreshExisting) {
        result.existing.push(target)
        continue
      }

      if (target.type === '央廚') {
        await syncCKMonthToSheets(target.storeId, month)
      } else {
        await syncStoreMonthToSheets(target.storeId, month)
      }
      if (hasCurrentTabs) result.synced.push(target)
      else result.created.push(target)
    } catch (syncError) {
      result.failed.push({
        ...target,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      })
    }
  }

  return result
}
