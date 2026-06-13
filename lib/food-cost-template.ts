import ExcelJS from 'exceljs'

export interface RowVals {
  pos: number; twpay: number; uber: Record<string, number>
  after_deduct: number; onsite: number; actual: number; ck: number
  result: number; revenue: number
  items: Record<string, number>
  notes: Record<string, string>
  foodTotal: number; packTotal: number; miscTotal: number; grandTotal: number
}

export const norm = (s: string) => s.replace(/[\s　（）()手動]/g, '').toLowerCase()

/**
 * Fills an ExcelJS worksheet with per-day data.
 * Mutates the worksheet in place.
 * Returns { headerRowNum, dataStartRow } on success, null if headers not found.
 */
export async function fillWorksheet(
  ws: ExcelJS.Worksheet,
  days: string[],
  dataRows: Array<{ date: string; row: RowVals }>,
  uberAccounts: string[],
): Promise<{ headerRowNum: number; dataStartRow: number } | null> {
  let headerRowNum = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) {
    console.warn(`[fillWorksheet] 找不到標題列（前10列欄A均無「日期」），工作表：${ws.name}`)
    return null
  }

  // Identify which columns belong to the 央廚配送 group (row 1 group labels)
  const groupOfCol: Record<number, string> = {}
  {
    let lastGroup = ''
    const endCol = (ws.columnCount || 0) + 10
    for (let c = 1; c <= endCol; c++) {
      const t = ws.getRow(1).getCell(c).text?.trim()
      if (t) lastGroup = t
      if (lastGroup) groupOfCol[c] = lastGroup
    }
  }

  // Build separate maps: CK group wins for duplicate column names
  const ckColMap: Record<string, number> = {}
  const stdColMap: Record<string, number> = {}
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t) return
    const m = groupOfCol[colNum] === '央廚配送' ? ckColMap : stdColMap
    if (!(t in m)) { m[t] = colNum; m[norm(t)] = colNum }
  })
  const colMap: Record<string, number> = { ...stdColMap, ...ckColMap }

  const dataStartRow = headerRowNum + 2
  const normUber = uberAccounts.map(acc => ({ raw: acc, n: norm(acc) }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasFormula = (cell: ExcelJS.Cell) => {
    const v = cell.value
    if (v == null || typeof v !== 'object') return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return 'formula' in (v as any) || 'sharedFormula' in (v as any)
  }

  // Clear stale plain-number values from data rows; leave formula cells untouched
  const uniqueCols = new Set(Object.values(colMap))
  days.forEach((_, idx) => {
    const row = ws.getRow(dataStartRow + idx)
    for (const colIdx of uniqueCols) {
      const cell = row.getCell(colIdx as number)
      if (typeof cell.value === 'number') cell.value = null
    }
  })

  days.forEach((date, idx) => {
    const rowNum = dataStartRow + idx
    const d = dataRows.find(dr => dr.date === date)?.row
    if (!d) return
    const excelRow = ws.getRow(rowNum)

    for (const [colName, amount] of Object.entries(d.items)) {
      if (!amount) continue
      const colIdx = colMap[colName] ?? colMap[norm(colName)]
      if (!colIdx) continue
      const cell = excelRow.getCell(colIdx)
      cell.value = amount
      const note = d.notes?.[colName]
      if (note) cell.note = note
    }

    const revPairs: [string, number][] = [
      ['pos', d.pos], ['twpay', d.twpay], ['實際$', d.actual],
      ['配送月底結', d.ck], ['結果', d.result],
      ['現場', d.onsite], ['扣除後的$', d.after_deduct], ['營業額', d.revenue],
    ]
    for (const [key, val] of revPairs) {
      const colIdx = colMap[key] ?? colMap[norm(key)]
      if (!colIdx || !val) continue
      const cell = excelRow.getCell(colIdx)
      cell.value = val
    }

    for (const { raw, n } of normUber) {
      const colIdx = colMap[n] ?? colMap[raw]
      if (!colIdx) continue
      const val = d.uber[raw] ?? 0
      if (!val) continue
      const cell = excelRow.getCell(colIdx)
      cell.value = val
    }
  })

  // ExcelJS shared-formula bug workaround: detach slave cells whose master was overwritten
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

/** Extract all cell values from a worksheet as a 2D array. */
export function extractValues(ws: ExcelJS.Worksheet): (string | number | null)[][] {
  const result: (string | number | null)[][] = []
  const maxRow = ws.rowCount
  const maxCol = ws.columnCount

  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r)
    const rowVals: (string | number | null)[] = []
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c)
      const cv = cell.value
      if (cv === null || cv === undefined) {
        rowVals.push(null)
      } else if (typeof cv === 'number') {
        rowVals.push(cv)
      } else if (typeof cv === 'string') {
        rowVals.push(cv)
      } else if (cv instanceof Date) {
        rowVals.push(cv.toISOString().slice(0, 10))
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyCV = cv as any
        if (anyCV.formula) {
          // Master formula cell: write formula string so Sheets evaluates it with fresh data
          const f = String(anyCV.formula)
          rowVals.push(f.startsWith('=') ? f : `=${f}`)
        } else if (anyCV.sharedFormula) {
          // Slave of a shared formula: reconstruct by adjusting the master's formula
          const masterAddr = anyCV.sharedFormula as string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const masterFormula = (ws.getCell(masterAddr)?.value as any)?.formula as string | undefined
          if (masterFormula) {
            const mp = a1ToRC(masterAddr)
            const adjusted = adjustFormula(masterFormula, r - mp.r, c - mp.c)
            rowVals.push(`=${adjusted}`)
          } else {
            rowVals.push(typeof anyCV.result === 'number' ? anyCV.result : null)
          }
        } else if (anyCV.result !== null && anyCV.result !== undefined) {
          rowVals.push(typeof anyCV.result === 'number' ? anyCV.result : String(anyCV.result))
        } else if (cell.text) {
          rowVals.push(cell.text)
        } else {
          rowVals.push(null)
        }
      }
    }
    result.push(rowVals)
  }
  return result
}

/** Extract background ARGB colors from a worksheet as a 2D array (null = no fill). */
export function extractColors(ws: ExcelJS.Worksheet): (string | null)[][] {
  const result: (string | null)[][] = []
  const maxRow = ws.rowCount
  const maxCol = ws.columnCount

  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r)
    const rowColors: (string | null)[] = []
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fillObj = cell.fill as any
      if (fillObj?.type === 'pattern' && fillObj.pattern !== 'none' && fillObj.fgColor?.argb) {
        rowColors.push(fillObj.fgColor.argb as string)
      } else {
        rowColors.push(null)
      }
    }
    result.push(rowColors)
  }
  return result
}

/** Extract bold flags from a worksheet as a 2D array. */
export function extractBold(ws: ExcelJS.Worksheet): boolean[][] {
  const result: boolean[][] = []
  const maxRow = ws.rowCount
  const maxCol = ws.columnCount

  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r)
    const rowBold: boolean[] = []
    for (let c = 1; c <= maxCol; c++) {
      rowBold.push(row.getCell(c).font?.bold ?? false)
    }
    result.push(rowBold)
  }
  return result
}

/** Extract column widths in approximate pixels (ExcelJS width unit × 7). */
export function extractColWidths(ws: ExcelJS.Worksheet): Array<{ col: number; px: number }> {
  const widths: Array<{ col: number; px: number }> = []
  ws.columns.forEach((col, idx) => {
    if (col?.width) widths.push({ col: idx, px: Math.max(20, Math.round(col.width * 7.5 + 5)) })
  })
  return widths
}

/** Extract merged cell ranges from a worksheet. */
export function extractMerges(ws: ExcelJS.Worksheet): Array<{ r0: number; r1: number; c0: number; c1: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (ws as any).model
  if (!model?.merges) return []
  return (model.merges as string[]).map(m => {
    const [start, end] = m.split(':')
    return {
      r0: rowColFromA1(start).r - 1,
      r1: rowColFromA1(end).r,
      c0: rowColFromA1(start).c - 1,
      c1: rowColFromA1(end).c,
    }
  })
}

function rowColFromA1(a1: string): { r: number; c: number } {
  return a1ToRC(a1)
}

/** Parse A1 address to 1-based { r, c }. */
function a1ToRC(a1: string): { r: number; c: number } {
  const m = a1.match(/^\$?([A-Z]+)\$?(\d+)$/)
  if (!m) return { r: 1, c: 1 }
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: parseInt(m[2]), c }
}

/** Convert 1-based column number to letter(s), e.g. 1→"A", 27→"AA". */
function colToLetter(n: number): string {
  let s = ''
  while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/**
 * Adjust A1 cell references in a formula by rowOffset/colOffset.
 * Respects absolute references ($A$1 stays fixed).
 */
function adjustFormula(formula: string, rowOffset: number, colOffset: number): string {
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_, ac, col, ar, row) => {
    let c = 0
    for (const ch of col) c = c * 26 + (ch.charCodeAt(0) - 64)
    const newC = ac ? c : c + colOffset
    const newR = ar ? parseInt(row) : parseInt(row) + rowOffset
    return (ac ? '$' : '') + colToLetter(newC) + (ar ? '$' : '') + newR
  })
}
