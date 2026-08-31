import ExcelJS from 'exceljs'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const norm = (s: string) => s.replace(/[\s　（）()]/g, '').toLowerCase()

function getTemplateStoreLayout(ws: ExcelJS.Worksheet): {
  headerRowNum: number
  weekdayCol: number
  revenueCol: number
} | null {
  let headerRowNum = -1
  for (let row = 1; row <= 10; row++) {
    if (ws.getRow(row).getCell(1).text?.replace(/[\s　]/g, '') === '日期') {
      headerRowNum = row
      break
    }
  }
  if (headerRowNum < 0) return null

  let weekdayCol = -1
  let revenueCol = -1
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const text = norm(cell.text?.trim() ?? '')
    if (text === norm('星期')) weekdayCol = colNum
    if (['營業額', '营业额'].includes(cell.text?.trim())) revenueCol = colNum
  })
  if (weekdayCol < 0) weekdayCol = 2
  if (revenueCol <= weekdayCol + 1) return null
  return { headerRowNum, weekdayCol, revenueCol }
}

export function ckTemplateHasStoreColumns(
  ws: ExcelJS.Worksheet,
  requiredStoreNames: string[],
): boolean {
  const layout = getTemplateStoreLayout(ws)
  if (!layout) return false

  const available = new Set<string>()
  for (let col = layout.weekdayCol + 1; col < layout.revenueCol; col++) {
    const name = ws.getRow(layout.headerRowNum).getCell(col).text?.trim()
    if (name) available.add(norm(name))
  }
  return requiredStoreNames.every(name => available.has(norm(name)))
}

/**
 * Reuses the store slots already present in an uploaded CK template, replacing
 * stale/duplicate store names while keeping every original style and column.
 */
export function prepareCKTemplateStoreColumns(
  ws: ExcelJS.Worksheet,
  requiredStoreNames: string[],
): boolean {
  const layout = getTemplateStoreLayout(ws)
  if (!layout) return false

  const storeNames = [...new Map(
    requiredStoreNames.filter(Boolean).map(name => [norm(name), name.trim()]),
  ).values()]
  const availableSlots = layout.revenueCol - layout.weekdayCol - 1
  if (availableSlots < storeNames.length) return false

  const headerRow = ws.getRow(layout.headerRowNum)
  for (let offset = 0; offset < availableSlots; offset++) {
    const columnNumber = layout.weekdayCol + 1 + offset
    headerRow.getCell(columnNumber).value = storeNames[offset] ?? null
    // Old templates used hidden placeholder columns for discontinued stores.
    // A current store assigned to one of those slots must always be visible in
    // both the downloaded Excel file and the synced Google Sheet.
    if (storeNames[offset]) {
      const column = ws.getColumn(columnNumber)
      column.hidden = false
      column.width = Math.max(column.width ?? 0, 12)
    }
  }
  return true
}

export interface CKDayData {
  storeRevenues: Record<string, number>
  expenses: Record<string, number>
  foodTotal: number
  packTotal: number
  miscTotal: number
  totalRevenue: number
  totalExpense: number
}

/** Google Sheets receives only the monthly tab, so formulas that reference a
 * helper worksheet would become #REF!. Remove only those cross-sheet formulas;
 * same-sheet formulas and the uploaded Excel workbook remain untouched. */
export function clearCKCrossSheetFormulas(ws: ExcelJS.Worksheet): void {
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const value = cell.value
      if (!value || typeof value !== 'object') return
      const formula = 'formula' in value ? value.formula : null
      if (typeof formula === 'string' && formula.includes('!')) cell.value = null
    })
  })
}

export function getDaysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

/**
 * Fills a CK template worksheet with monthly data.
 * Mutates the worksheet in place. Returns { headerRowNum, dataStartRow } or null on failure.
 */
export function fillCKWorksheet(
  ws: ExcelJS.Worksheet,
  days: string[],
  dataMap: Record<string, CKDayData>,
): { headerRowNum: number; dataStartRow: number } | null {
  let headerRowNum = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) return null

  const colMap: Record<string, number> = {}
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t) return
    colMap[t] = colNum
    colMap[norm(t)] = colNum
  })

  const dataStartRow = headerRowNum + 2
  const firstDate = days[0]
  const monthNum = firstDate ? Number(firstDate.slice(5, 7)) : null
  const dateCol = colMap['日期'] ?? colMap[norm('日期')] ?? 1
  const weekdayCol = colMap['星期'] ?? colMap[norm('星期')] ?? dateCol + 1
  const revenueCol = colMap['營業額'] ?? colMap['营业额']
  const totalExpenseCol = colMap['總'] ?? colMap['总'] ?? colMap['總支出'] ?? colMap['总支出']
  const storeColumns: Array<{ col: number; name: string }> = []

  // CK templates place member/external-store revenue columns between 日期/星期
  // and 營業額. These cells may contain formulas that refer to helper sheets in
  // the original Excel file; Google Sheets only receives the monthly tab, so
  // write the authoritative database amounts into these cells directly.
  if (revenueCol && revenueCol > weekdayCol) {
    for (let col = weekdayCol + 1; col < revenueCol; col++) {
      storeColumns.push({ col, name: ws.getRow(headerRowNum).getCell(col).text?.trim() ?? '' })
    }
  }

  if (monthNum) {
    ws.name = `${monthNum}月食耗成本`
    ws.getRow(headerRowNum + 1).getCell(dateCol).value = `${monthNum}月`
  }

  const uniqueCols = new Set(Object.values(colMap))
  const referenceStoreColumn = storeColumns[0]?.col
  days.forEach((_, idx) => {
    const excelRow = ws.getRow(dataStartRow + idx)
    if (referenceStoreColumn) {
      const referenceStyle = excelRow.getCell(referenceStoreColumn).style
      for (const storeColumn of storeColumns) {
        // A hidden placeholder may carry stale black/blocked formatting from
        // the old month. Current store cells should use the same daily style
        // as the template's first normal store column.
        storeColumnCellStyle(excelRow.getCell(storeColumn.col), referenceStyle)
      }
    }
    for (const colIdx of uniqueCols) {
      excelRow.getCell(colIdx as number).value = null
    }
  })

  function setValue(row: ExcelJS.Row, colIdx: number | undefined, value: number) {
    if (!colIdx) return
    row.getCell(colIdx).value = value || null
  }

  days.forEach((date, idx) => {
    const rowNum = dataStartRow + idx
    const d = dataMap[date]
    const excelRow = ws.getRow(rowNum)

    excelRow.getCell(dateCol).value = new Date(`${date}T00:00:00+08:00`)
    const weekday = new Date(`${date}T12:00:00+08:00`).getDay()
    excelRow.getCell(weekdayCol).value = `星期${WEEKDAYS[weekday]}`

    for (const storeColumn of storeColumns) {
      const matched = Object.entries(d?.storeRevenues ?? {}).find(([name]) => (
        name === storeColumn.name || norm(name) === norm(storeColumn.name)
      ))
      excelRow.getCell(storeColumn.col).value = matched?.[1] || null
    }

    if (!d) return

    setValue(excelRow, revenueCol, d.totalRevenue)
    setValue(excelRow, totalExpenseCol, d.totalExpense)
    setValue(excelRow, colMap['食材'], d.foodTotal)
    setValue(excelRow, colMap['耗材'], d.packTotal)
    setValue(excelRow, colMap['雜項'], d.miscTotal)

    for (const [itemName, amount] of Object.entries(d.expenses)) {
      if (!amount) continue
      const colIdx = colMap[itemName] ?? colMap[norm(itemName)]
      setValue(excelRow, colIdx, amount)
    }
  })

  // Replace the template's old monthly formulas (which may reference helper
  // sheets that are not copied to Google Sheets) with authoritative totals.
  const totalRow = ws.getRow(headerRowNum + 1)
  for (const colIdx of uniqueCols) {
    if (colIdx !== dateCol && colIdx !== weekdayCol) totalRow.getCell(colIdx as number).value = null
  }
  const monthData = days.map(date => dataMap[date]).filter((day): day is CKDayData => Boolean(day))
  for (const storeColumn of storeColumns) {
    const total = monthData.reduce((sum, day) => {
      const amount = Object.entries(day.storeRevenues).find(([name]) => (
        name === storeColumn.name || norm(name) === norm(storeColumn.name)
      ))?.[1] ?? 0
      return sum + amount
    }, 0)
    setValue(totalRow, storeColumn.col, total)
  }
  setValue(totalRow, revenueCol, monthData.reduce((sum, day) => sum + day.totalRevenue, 0))
  setValue(totalRow, totalExpenseCol, monthData.reduce((sum, day) => sum + day.totalExpense, 0))
  setValue(totalRow, colMap['食材'], monthData.reduce((sum, day) => sum + day.foodTotal, 0))
  setValue(totalRow, colMap['耗材'], monthData.reduce((sum, day) => sum + day.packTotal, 0))
  setValue(totalRow, colMap['雜項'], monthData.reduce((sum, day) => sum + day.miscTotal, 0))

  const monthlyExpenses: Record<string, number> = {}
  for (const day of monthData) {
    for (const [itemName, amount] of Object.entries(day.expenses)) {
      monthlyExpenses[itemName] = (monthlyExpenses[itemName] ?? 0) + amount
    }
  }
  for (const [itemName, amount] of Object.entries(monthlyExpenses)) {
    setValue(totalRow, colMap[itemName] ?? colMap[norm(itemName)], amount)
  }

  // Resolve shared-formula slave cells
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value
      if (!v || typeof v !== 'object') return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sv = v as any
      if (!('sharedFormula' in sv)) return
      const masterCell = ws.getCell(sv.sharedFormula as string)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const masterV = masterCell?.value as any
      if (!masterV || typeof masterV !== 'object' || !('formula' in masterV)) {
        cell.value = sv.result ?? null
      }
    })
  })

  // Keep the template's wider columns, but grow any narrow data column enough
  // to show its header and largest monthly/daily number without truncation.
  for (const colIdx of uniqueCols) {
    const columnNumber = colIdx as number
    const headerText = ws.getRow(headerRowNum).getCell(columnNumber).text?.trim() ?? ''
    if (!headerText) continue
    let maxCharacters = headerText.length
    for (let rowNumber = headerRowNum + 1; rowNumber < dataStartRow + days.length; rowNumber++) {
      const value = ws.getRow(rowNumber).getCell(columnNumber).value
      let display = ''
      if (typeof value === 'number') display = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      else if (value instanceof Date) display = `${value.getMonth() + 1}月${value.getDate()}日`
      else if (typeof value === 'string') display = value
      maxCharacters = Math.max(maxCharacters, display.length)
    }
    const column = ws.getColumn(columnNumber)
    const requiredWidth = Math.min(Math.max(maxCharacters + 2, 8), 24)
    column.width = Math.max(column.width ?? 0, requiredWidth)
  }

  return { headerRowNum, dataStartRow }
}

function storeColumnCellStyle(cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>): void {
  cell.style = JSON.parse(JSON.stringify(style)) as Partial<ExcelJS.Style>
}

/**
 * Builds a generated CK workbook (used when no template is uploaded).
 */
export function buildCKGeneratedWorkbook(
  monthNum: number,
  days: string[],
  dataMap: Record<string, CKDayData>,
  assignedStoreNames: string[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CK Accounting'
  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  })

  const externalNames = [...new Set(
    Object.values(dataMap).flatMap(d => Object.keys(d.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name))
  )]
  const allStoreNames = [...assignedStoreNames, ...externalNames]

  const headers = ['日期', '星期', ...allStoreNames, '營業額', '食材', '耗材', '雜項', '總支出']
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }

  for (const date of days) {
    const d = dataMap[date]
    const dt = new Date(date + 'T00:00:00+08:00')
    const storeRevCols = allStoreNames.map(name => d?.storeRevenues[name] ?? null)
    ws.addRow([
      date,
      `星期${WEEKDAYS[dt.getDay()]}`,
      ...storeRevCols,
      d?.totalRevenue || null,
      d?.foodTotal || null,
      d?.packTotal || null,
      d?.miscTotal || null,
      d?.totalExpense || null,
    ])
  }

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 7
  for (let c = 3; c <= headers.length; c++) {
    ws.getColumn(c).width = Math.max(headers[c - 1].length * 1.8 + 2, 8)
  }

  return wb
}
