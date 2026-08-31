import ExcelJS from 'exceljs'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const norm = (s: string) => s.replace(/[\s　（）()]/g, '').toLowerCase()

function hasFormula(cell: ExcelJS.Cell): boolean {
  const v = cell.value
  if (v == null || typeof v !== 'object') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return 'formula' in (v as any) || 'sharedFormula' in (v as any)
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
  days.forEach((_, idx) => {
    const excelRow = ws.getRow(dataStartRow + idx)
    for (const colIdx of uniqueCols) {
      const cell = excelRow.getCell(colIdx as number)
      if (typeof cell.value === 'number') cell.value = null
    }
  })

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

    function setIfNotFormula(colIdx: number | undefined, value: number) {
      if (!colIdx || !value) return
      const cell = excelRow.getCell(colIdx)
      if (!hasFormula(cell)) cell.value = value
    }

    setIfNotFormula(colMap['營業額'] ?? colMap['营业额'], d.totalRevenue)
    setIfNotFormula(colMap['總'] ?? colMap['总'], d.totalExpense)
    setIfNotFormula(colMap['食材'], d.foodTotal)
    setIfNotFormula(colMap['耗材'], d.packTotal)
    setIfNotFormula(colMap['雜項'], d.miscTotal)

    for (const [itemName, amount] of Object.entries(d.expenses)) {
      if (!amount) continue
      const colIdx = colMap[itemName] ?? colMap[norm(itemName)]
      setIfNotFormula(colIdx, amount)
    }
  })

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

  return { headerRowNum, dataStartRow }
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
