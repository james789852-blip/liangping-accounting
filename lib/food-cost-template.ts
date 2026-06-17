import ExcelJS from 'exceljs'

export interface RowVals {
  pos: number; twpay: number; uber: Record<string, number>
  panda: number; online: number; online_cash?: number
  after_deduct: number; onsite: number; actual: number; ck: number
  result: number; revenue: number        // 營業額 = 現場 + 結果（給 "營業額" 欄）
  totalRevenue?: number                  // 真實總營業額（給 "(手動)POS" 欄）
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
  vendorGroupLookup?: Record<string, string>,
): Promise<{ headerRowNum: number; dataStartRow: number } | null> {
  let headerRowNum = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) {
    console.warn(`[fillWorksheet] 找不到標題列（前10列欄A均無「日期」），工作表：${ws.name}`)
    return null
  }

  // 群組標籤：以 vendor 列為主、文件類型列（發票/收據/估價單）為輔，否則歸「未分類」
  // 避免將「翁師傅 | 達特 | (空) 發票 | ...」中的「發票」欄位誤掛到「達特」下
  // 若 headerRowNum < 3 表示模板沒有 vendor / docType 列，跳過分組
  const groupOfCol: Record<number, string> = headerRowNum >= 3
    ? buildGroupByMerge(ws, headerRowNum - 2, headerRowNum - 1)
    : {}

  // Build separate maps: CK group wins for duplicate column names
  const ckColMap: Record<string, number> = {}
  const stdColMap: Record<string, number> = {}
  // Per-vendor-group maps: used to disambiguate duplicate column names across vendor sections
  const vendorMaps: Record<string, Record<string, number>> = {}
  // Comprehensive map: normalized name → ALL column indices (sorted); handles duplicate names like 稅金
  const allColsByNormName: Record<string, number[]> = {}
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t) return
    const group = groupOfCol[colNum]
    const m = group === '央廚配送' ? ckColMap : stdColMap
    if (!(t in m)) { m[t] = colNum; m[norm(t)] = colNum }
    if (group && group !== '央廚配送') {
      if (!vendorMaps[group]) vendorMaps[group] = {}
      if (!(t in vendorMaps[group])) { vendorMaps[group][t] = colNum; vendorMaps[group][norm(t)] = colNum }
    }
    const n = norm(t)
    if (!allColsByNormName[n]) allColsByNormName[n] = []
    if (!allColsByNormName[n].includes(colNum)) allColsByNormName[n].push(colNum)
  })
  for (const n of Object.keys(allColsByNormName)) allColsByNormName[n].sort((a, b) => a - b)
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

  // Clear stale plain-number values from data rows; include every column that appears in the header
  const uniqueCols = new Set<number>([
    ...Object.values(colMap) as number[],
    ...Object.values(allColsByNormName).flat(),
  ])
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
      let colIdx: number | undefined

      if (colName.startsWith('_tax_')) {
        // Namespaced vendor tax: '_tax_菜商::油豆腐|青江菜' → 解析出 vendor 和品項
        // 先找品項專屬稅金欄（例如 "豆腐稅金" 給 油豆腐），找不到再 fallback
        // 到 vendor section 後第一個通用稅金欄（退稅/稅金）。
        const tail = colName.slice(5)
        const [vgName, itemsCSV] = tail.split('::')
        const receiptItems = (itemsCSV ?? '').split('|').filter(Boolean)

        const allTaxCols: { col: number; header: string }[] = []
        ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
          const t = (cell.text ?? '').trim()
          if (t.includes('稅')) allTaxCols.push({ col: colNum, header: t })
        })
        allTaxCols.sort((a, b) => a.col - b.col)
        const taxColSet = new Set(allTaxCols.map(x => x.col))
        const vgCols = Object.values(vendorMaps[vgName] || {})
          .filter((v): v is number => typeof v === 'number' && !taxColSet.has(v))
        const maxVGCol = vgCols.length > 0 ? Math.max(...vgCols) : 0

        // 1) 嘗試 item-specific 稅金欄：header 去掉「稅金/退稅/稅」之後若為品項名子字串，視為專屬欄
        // 例：header "豆腐稅金" → 去掉 "稅金" 剩 "豆腐"；item "油豆腐" 包含 "豆腐" → 匹配
        const stripTax = (h: string) => h.replace(/稅金|退稅|稅/g, '').replace(/[\s　（）()-]/g, '').trim()
        let itemSpecific: number | undefined
        for (const tc of allTaxCols) {
          const core = stripTax(tc.header)
          if (!core) continue  // 純 "退稅"/"稅金"/"稅" 不算 item-specific
          if (receiptItems.some(it => it.includes(core) || core.includes(it))) {
            itemSpecific = tc.col
            break
          }
        }

        if (itemSpecific) {
          colIdx = itemSpecific
        } else {
          // 2) 依 receipt 品項實際在模板的最右欄位置之後找第一個稅金欄
          //    （比依賴 vendorMaps 推算範圍更可靠）
          const itemCols: number[] = []
          for (const item of receiptItems) {
            const c = vendorMaps[vgName]?.[item]
              ?? vendorMaps[vgName]?.[norm(item)]
              ?? colMap[item]
              ?? colMap[norm(item)]
            if (typeof c === 'number') itemCols.push(c)
          }
          const maxItemCol = itemCols.length > 0 ? Math.max(...itemCols) : maxVGCol
          colIdx = allTaxCols.find(x => x.col > maxItemCol)?.col
        }
      } else if (colName.startsWith('_col_')) {
        // Vendor-disambiguated item: '_col_翁師傅_其他' → vendorMaps['翁師傅']['其他']
        // Used when the same excel column name appears in multiple vendor sections.
        const withoutPrefix = colName.slice(5)
        const sepIdx = withoutPrefix.indexOf('_')
        if (sepIdx >= 0) {
          const vgName = withoutPrefix.slice(0, sepIdx)
          const realColName = withoutPrefix.slice(sepIdx + 1)
          colIdx = vendorMaps[vgName]?.[realColName] ?? vendorMaps[vgName]?.[norm(realColName)]
        }
      } else {
        const vg = vendorGroupLookup?.[colName]
        const vgMap = vg ? vendorMaps[vg] : undefined
        colIdx = (vgMap && (vgMap[colName] ?? vgMap[norm(colName)])) ?? colMap[colName] ?? colMap[norm(colName)]
      }

      if (!colIdx) continue
      const cell = excelRow.getCell(colIdx)
      if (hasFormula(cell)) continue  // 尊重模板公式
      cell.value = amount
      const note = d.notes?.[colName]
      if (note) cell.note = note
    }

    // 主要欄位（單一名稱）— 若 cell 已有公式則保留模板的公式，不覆寫
    const revPairs: [string, number][] = [
      ['pos', d.pos], ['實際$', d.actual],
      ['配送月底結', d.ck], ['結果', d.result],
      ['現場', d.onsite], ['扣除後的$', d.after_deduct], ['營業額', d.revenue],
    ]
    for (const [key, val] of revPairs) {
      const colIdx = colMap[key] ?? colMap[norm(key)]
      if (!colIdx || !val) continue
      const cell = excelRow.getCell(colIdx)
      if (hasFormula(cell)) continue  // 尊重模板公式
      cell.value = val
    }
    // 「(手動)POS」欄位專屬處理：適用沒有真正 POS（手寫店家）的店家，
    // 店長手動把當日全部營收（手寫+uber+...）填到 POS 欄位 → 寫總營業額
    {
      let manualPOSCol: number | undefined
      ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
        if (manualPOSCol) return
        const t = (cell.text ?? '').trim()
        if (t.includes('手動') && t.toLowerCase().includes('pos')) manualPOSCol = colNum
      })
      const totalRev = d.totalRevenue ?? 0
      if (manualPOSCol && totalRev) {
        const cell = excelRow.getCell(manualPOSCol)
        if (!hasFormula(cell)) cell.value = totalRev
      }
    }
    // 熊貓 / 線上點餐 / 台灣Pay / 線上點餐(現金)：欄位名稱版本多，逐一嘗試直到找到
    const revAliases: { val: number; keys: string[] }[] = [
      { val: d.panda, keys: ['熊貓', 'panda', 'foodpanda', '熊貓 foodpanda', 'fp'] },
      { val: d.online, keys: ['線上', '線上點餐', 'online', '線上訂餐'] },
      { val: d.online_cash ?? 0, keys: ['線上點餐(現金)', '線上點餐（現金）', '線上(現金)', '線上（現金）', 'online cash', 'online_cash', '線上現金'] },
      { val: d.twpay, keys: ['twpay', 'tw pay', 'taiwan pay', 'taiwanpay', '台灣pay', '台灣 pay', '台灣支付'] },
    ]
    for (const { val, keys } of revAliases) {
      if (!val) continue
      let colIdx: number | undefined
      for (const k of keys) {
        colIdx = colMap[k] ?? colMap[norm(k)]
        if (colIdx) break
      }
      if (!colIdx) continue
      const cell = excelRow.getCell(colIdx)
      if (hasFormula(cell)) continue
      cell.value = val
    }

    for (const { raw, n } of normUber) {
      const colIdx = colMap[n] ?? colMap[raw]
      if (!colIdx) continue
      const val = d.uber[raw] ?? 0
      if (!val) continue
      const cell = excelRow.getCell(colIdx)
      if (hasFormula(cell)) continue
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
        // Return Excel serial number so Sheets can apply the cell's numFmt (e.g. m"月"d"日")
        const excelEpoch = Date.UTC(1899, 11, 30)
        rowVals.push(Math.round((cv.getTime() - excelEpoch) / 86400000))
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

/** Extract column widths in approximate pixels (ExcelJS width unit × 7). Hidden columns included with hidden:true. */
export function extractColWidths(ws: ExcelJS.Worksheet): Array<{ col: number; px: number; hidden?: boolean }> {
  const widths: Array<{ col: number; px: number; hidden?: boolean }> = []
  ws.columns.forEach((col, idx) => {
    if (col?.hidden) {
      widths.push({ col: idx, px: 0, hidden: true })
    } else if (col?.width) {
      widths.push({ col: idx, px: Math.max(20, Math.round(col.width * 7.5 + 5)) })
    }
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

/**
 * 取得指定 row 在某 column 的文字：若 column 屬於合併儲存格 → 用 master cell；
 * 否則取自己 cell 的 text。傳回 trim 後的字串，無內容時為空字串。
 */
function readRowTextByMerge(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  maxCol: number,
): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges = ((ws as any).model?.merges as string[] | undefined) ?? []
  const colToMaster = new Map<number, number>()
  for (const m of merges) {
    const [start, end] = m.split(':')
    const s = a1ToRC(start)
    const e = a1ToRC(end)
    if (s.r <= rowNum && e.r >= rowNum) {
      for (let c = s.c; c <= e.c; c++) colToMaster.set(c, s.c)
    }
  }
  const result: string[] = []
  for (let c = 1; c <= maxCol; c++) {
    const masterCol = colToMaster.get(c)
    if (masterCol !== undefined) {
      // 合併儲存格內：所有欄位都用 master cell 的文字
      result[c] = ws.getRow(rowNum).getCell(masterCol).text?.trim() ?? ''
    } else {
      result[c] = ws.getRow(rowNum).getCell(c).text?.trim() ?? ''
    }
  }
  return result
}

const DOC_TYPE_PATTERNS = ['發票', '收據', '估價單', '公司開']

/**
 * 依模板的「廠商列 (vendorRow) + 單據類型列 (docTypeRow)」判斷 column 的分類群組。
 *
 * 規則（優先級由上而下）：
 *  1. vendorRow 有文字 → 用該文字（合併儲存格取 master）
 *  2. vendorRow 空白、docTypeRow 有文字（限 發票/收據/估價單 等）→ 用 docTypeRow
 *  3. 兩列都空 → 標記為「未分類」
 *
 * 注意：獨立空白 cell **不再向左繼承**；發票列的群組獨立於旁邊 vendor 之外。
 */
export function buildGroupByMerge(
  ws: ExcelJS.Worksheet,
  vendorRow: number,
  docTypeRow?: number,
): Record<number, string> {
  const maxCol = Math.max((ws.columnCount || 0) + 5, 100)
  const vendorTexts = readRowTextByMerge(ws, vendorRow, maxCol)
  const docTexts = docTypeRow ? readRowTextByMerge(ws, docTypeRow, maxCol) : []

  const result: Record<number, string> = {}
  for (let c = 1; c <= maxCol; c++) {
    const v = vendorTexts[c] ?? ''
    if (v) { result[c] = v; continue }
    const d = docTexts[c] ?? ''
    if (d && DOC_TYPE_PATTERNS.some(p => d.includes(p))) {
      result[c] = d
      continue
    }
    // 兩列都空 → 標記未分類（呼叫端可決定要不要存）
    result[c] = '未分類'
  }
  return result
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
