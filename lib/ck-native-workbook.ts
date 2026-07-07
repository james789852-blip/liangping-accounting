/**
 * 央廚食耗成本 xlsx（系統原生產出，無模板依賴）
 *
 * Layout：
 *   Row 1: 收入區「訂單收入」+ 支出區「費用支出」
 *   Row 2: 收入子群（成員店家 / 外部店家）+ 支出子群（食材 / 耗材 / 雜項）
 *   Row 3: 欄位標題（日期 / 星期 + 各店名 / 外部店 + 各費用品項 + 合計欄）
 *   Row 4: 月合計 (SUM 公式)
 *   Row 5..: 每日資料
 */
import ExcelJS from 'exceljs'
import { getCKMonthlyStats } from '@/lib/ck-aggregator'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

interface ColumnDef {
  index: number
  header: string
  kind: 'date' | 'weekday' | 'member' | 'external' | 'expense' | 'stat'
  category?: '食材' | '耗材' | '雜項'
  vendorGroup?: string
  docType?: string
  itemKey?: string
  statKey?: 'memberRevenue' | 'externalRevenue' | 'revenue' | 'invoice' | 'receipt' | 'refund' | 'food' | 'pack' | 'misc' | 'totalExpense' | 'balance'
}

function colLetter(colNum: number): string {
  let s = ''; let n = colNum
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const CK_FONT = 'Microsoft JhengHei'
const CK_GRID = 'FF000000'
const CK_PAPER = 'FFFFFFCC'
const CK_MONTH_YELLOW = 'FFFFFF00'
const CK_HEADER_GRAY = 'FFBFBFBF'
const CK_BLUE = 'FFC6D9F0'
const CK_ORANGE = 'FFFCD5B4'
const CK_GREEN = 'FFD9EAD3'
const CK_TOTAL_ORANGE = 'FFF79646'
const CK_BLACK = 'FF000000'
const CK_WEEKEND = 'FFBFBFBF'
const CK_STORE_COLORS = [
  'FFD9EAD3', 'FF9BC2CF', 'FFEAD1DC', 'FFF4B183',
  'FF77933C', 'FFDA9694', 'FFC6E0B4', 'FFFFF2CC',
]
const CK_VG_PALETTE = [
  'FFEAD1DC', 'FFD9EAD3', 'FFFCE4D6', 'FFFFF2CC',
  'FFDCEBF3', 'FFF4CCCC', 'FFC9DAF8', 'FFE2EFDA',
  'FFFCE5CD', 'FFEFEFEF', 'FFFDEBD0', 'FFD5E8D4',
]
function ckVgColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CK_VG_PALETTE[h % CK_VG_PALETTE.length]
}
const CK_DOC_COLOR: Record<string, string> = {
  '發票': 'FFD9E2F3', '收據': 'FFFCE4D6', '估價單': 'FFE2EFDA',
  '公司開': 'FFD9E2F3', '梁鑫開': 'FFEAD1DC', '府中開': 'FFFFF2CC',
}
function ckDocColor(doc: string): string { return CK_DOC_COLOR[doc] ?? 'FFF2F2F2' }

function thinBorder(color = CK_GRID): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  }
}

function fillHeader(cell: ExcelJS.Cell, text: string, fill?: string, bold = false, fontColor = 'FF000000', size = 13) {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, shrinkToFit: false }
  cell.font = { name: CK_FONT, size, bold, color: { argb: fontColor } }
  cell.border = thinBorder() as ExcelJS.Borders
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
}

function setFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function styleDataCell(cell: ExcelJS.Cell, fill: string, align: 'center' | 'right' = 'right') {
  setFill(cell, fill)
  cell.border = thinBorder() as ExcelJS.Borders
  cell.alignment = { horizontal: align, vertical: 'middle', shrinkToFit: false, wrapText: false }
  cell.font = { name: CK_FONT, size: 12, color: { argb: 'FF000000' } }
  if (typeof cell.value === 'number' || (cell.value && typeof cell.value === 'object')) {
    cell.numFmt = '#,##0;-#,##0;"-"'
  }
}

function applySide(cell: ExcelJS.Cell, side: 'left' | 'right', style: 'medium' | 'thick' = 'medium') {
  const current = (cell.border ?? {}) as ExcelJS.Borders
  cell.border = {
    ...current,
    [side]: { style, color: { argb: CK_GRID } },
  } as ExcelJS.Borders
}

function columnFill(c: ColumnDef): string {
  if (c.kind === 'date' || c.kind === 'weekday') return CK_PAPER
  if (c.kind === 'member' || c.kind === 'external') return CK_PAPER
  if (c.kind === 'expense') {
    if (c.category === '食材') return 'FFFFFFFF'
    if (c.category === '耗材') return CK_BLUE
    return CK_ORANGE
  }
  if (c.kind === 'stat') {
    if (c.statKey === 'revenue' || c.statKey === 'balance') return CK_MONTH_YELLOW
    if (c.statKey === 'invoice') return 'FFD9E2F3'
    if (c.statKey === 'receipt') return 'FFFCE4D6'
    if (c.statKey === 'refund') return CK_GREEN
    if (c.statKey === 'food') return CK_ORANGE
    if (c.statKey === 'pack') return 'FF4BACC6'
    if (c.statKey === 'misc') return CK_TOTAL_ORANGE
    return CK_HEADER_GRAY
  }
  return 'FFFFFFFF'
}

function headerFill(c: ColumnDef): string {
  if (c.kind === 'date' || c.kind === 'weekday') return CK_HEADER_GRAY
  if (c.kind === 'member' || c.kind === 'external') return CK_TOTAL_ORANGE
  if (c.kind === 'expense') return CK_HEADER_GRAY
  if (c.kind === 'stat' && c.statKey === 'invoice') return 'FF00B0F0'
  if (c.kind === 'stat' && c.statKey === 'receipt') return CK_TOTAL_ORANGE
  if (c.kind === 'stat' && c.statKey === 'refund') return 'FFA9D18E'
  if (c.kind === 'stat') return c.statKey === 'balance' ? CK_MONTH_YELLOW : CK_BLACK
  return CK_HEADER_GRAY
}

function headerFontColor(c: ColumnDef): string {
  return c.kind === 'stat' && c.statKey !== 'balance' && !['invoice', 'receipt', 'refund'].includes(c.statKey ?? '') ? 'FFFFFFFF' : 'FF000000'
}

function displayHeader(text: string): string {
  return text.replace(/^[^・]+・/, '')
}

function storeHeaderColor(index: number): string {
  return CK_STORE_COLORS[index % CK_STORE_COLORS.length]
}

function statFormula(
  key: ColumnDef['statKey'],
  rowNum: number,
  totalRow: number,
  memberColStart: number | undefined,
  memberColEnd: number | undefined,
  extColStart: number | undefined,
  extColEnd: number | undefined,
  expenseCols: ColumnDef[],
  foodExpCols: ColumnDef[],
  packExpCols: ColumnDef[],
  miscExpCols: ColumnDef[],
  cols: ColumnDef[],
): string | null {
  const rowRef = rowNum === totalRow ? totalRow : rowNum
  const expenseStart = expenseCols[0]?.index
  const expenseEnd = expenseCols[expenseCols.length - 1]?.index
  if (key === 'revenue') {
    const parts: string[] = []
    if (memberColStart && memberColEnd) parts.push(`SUM(${colLetter(memberColStart)}${rowRef}:${colLetter(memberColEnd)}${rowRef})`)
    if (extColStart && extColEnd) parts.push(`SUM(${colLetter(extColStart)}${rowRef}:${colLetter(extColEnd)}${rowRef})`)
    return parts.length > 0 ? parts.join('+') : '0'
  }
  if (key === 'invoice' && expenseStart && expenseEnd) {
    const invoiceCells = expenseCols.filter(c => c.docType === '發票').map(c => `${colLetter(c.index)}${rowRef}`)
    return invoiceCells.length > 0 ? invoiceCells.join('+') : '0'
  }
  if (key === 'receipt' && expenseStart && expenseEnd) {
    const receiptCells = expenseCols.filter(c => c.docType === '收據').map(c => `${colLetter(c.index)}${rowRef}`)
    return receiptCells.length > 0 ? receiptCells.join('+') : '0'
  }
  if (key === 'refund' && expenseStart && expenseEnd) {
    const refundCells = expenseCols.filter(c => c.docType === '發票' && c.vendorGroup === '退稅').map(c => `${colLetter(c.index)}${rowRef}`)
    return refundCells.length > 0 ? refundCells.join('+') : '0'
  }
  if (key === 'food' && foodExpCols.length > 0) {
    return `SUM(${colLetter(foodExpCols[0].index)}${rowRef}:${colLetter(foodExpCols[foodExpCols.length - 1].index)}${rowRef})`
  }
  if (key === 'pack' && packExpCols.length > 0) {
    return `SUM(${colLetter(packExpCols[0].index)}${rowRef}:${colLetter(packExpCols[packExpCols.length - 1].index)}${rowRef})`
  }
  if (key === 'misc' && miscExpCols.length > 0) {
    return `SUM(${colLetter(miscExpCols[0].index)}${rowRef}:${colLetter(miscExpCols[miscExpCols.length - 1].index)}${rowRef})`
  }
  if (key === 'totalExpense') {
    const foodCol = cols.find(x => x.statKey === 'food')
    const packCol = cols.find(x => x.statKey === 'pack')
    const miscCol = cols.find(x => x.statKey === 'misc')
    if (foodCol && packCol && miscCol) return `${colLetter(foodCol.index)}${rowRef}+${colLetter(packCol.index)}${rowRef}+${colLetter(miscCol.index)}${rowRef}`
  }
  if (key === 'balance') {
    const revCol = cols.find(x => x.statKey === 'revenue')
    const totalExpCol = cols.find(x => x.statKey === 'totalExpense')
    if (revCol && totalExpCol) return `${colLetter(revCol.index)}${rowRef}-${colLetter(totalExpCol.index)}${rowRef}`
  }
  return null
}

/** 在既有 workbook 上加一個「N 月央廚食耗」sheet */
export async function addCKSheet(
  wb: ExcelJS.Workbook,
  ckStoreId: string,
  year: number,
  monthNum: number,
): Promise<void> {
  const [monthly, mappingItems] = await Promise.all([
    getCKMonthlyStats(ckStoreId, year, monthNum),
    getStoreItemsFromMappings(ckStoreId),
  ])

  const ws = wb.addWorksheet(`${monthNum}月央廚食耗`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
  })

  // 動態欄：成員店家 / 外部店家 / 支出品項
  //   支出品項改為 mapping-based（跟店家 xlsx 一樣）：
  //   即使當月沒錄，layout 也顯示所有已設定品項欄；已錄金額自動填入
  const memberStores = monthly.memberByStore
  const externalNames = monthly.externalByName
  const expenseByName = new Map(monthly.expenseByItem.map(e => [e.item_name, e]))
  // 用 mapping 為主，若 mapping 沒有但實際有錄 → 也補進來（避免資料消失）
  const seen = new Set(mappingItems.map(m => m.name))
  const orphanFromReceipts = monthly.expenseByItem.filter(e => !seen.has(e.item_name))
  const expenseItems: typeof monthly.expenseByItem = [
    ...mappingItems.map(m => {
      const rec = expenseByName.get(m.name)
      return {
        item_name: m.name,
        category: m.category,
        vendor_group: m.vendor_group,
        doc_type: m.doc_type ?? '',
        total: rec?.total ?? 0,
      }
    }),
    ...orphanFromReceipts,
  ]

  const cols: ColumnDef[] = []
  let idx = 1
  cols.push({ index: idx++, header: '日期', kind: 'date' })
  cols.push({ index: idx++, header: '星期', kind: 'weekday' })

  // 成員店家收入欄
  for (const m of memberStores) {
    cols.push({ index: idx++, header: m.store_name, kind: 'member', itemKey: m.store_id })
  }
  // 外部店家收入欄
  for (const e of externalNames) {
    cols.push({ index: idx++, header: e.name, kind: 'external', itemKey: e.name })
  }

  // 店家叫貨與單據統計欄：順序比照舊 Excel，先看店家，再看總發票 / 食材耗材雜項。
  cols.push({ index: idx++, header: '總收入', kind: 'stat', statKey: 'revenue' })
  cols.push({ index: idx++, header: '總發票', kind: 'stat', statKey: 'invoice' })
  cols.push({ index: idx++, header: '總收據', kind: 'stat', statKey: 'receipt' })
  cols.push({ index: idx++, header: '梁平退稅', kind: 'stat', statKey: 'refund' })
  cols.push({ index: idx++, header: '食材', kind: 'stat', statKey: 'food' })
  cols.push({ index: idx++, header: '耗材', kind: 'stat', statKey: 'pack' })
  cols.push({ index: idx++, header: '雜項', kind: 'stat', statKey: 'misc' })
  cols.push({ index: idx++, header: '總支出', kind: 'stat', statKey: 'totalExpense' })
  cols.push({ index: idx++, header: '淨額', kind: 'stat', statKey: 'balance' })

  // 支出品項欄（依 category → vendor_group → doc_type → item_name 排序）
  const catOrder: Record<string, number> = { '食材': 0, '耗材': 1, '雜項': 2 }
  const sortedExpenseItems = [...expenseItems].sort((a, b) =>
    (catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3)
    || (a.vendor_group || '').localeCompare(b.vendor_group || '')
    || (a.doc_type || '').localeCompare(b.doc_type || '')
    || b.total - a.total
  )
  for (const e of sortedExpenseItems) {
    cols.push({
      index: idx++,
      header: e.item_name,
      kind: 'expense',
      category: e.category as any,
      vendorGroup: e.vendor_group || '',
      docType: e.doc_type || '',
      itemKey: `${e.category}||${e.vendor_group || ''}||${e.doc_type || ''}||${e.item_name}`,
    })
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const HEADER_ROW = 3
  const TOTAL_ROW = 4
  const DATA_START = 5

  // Row 1 大群組 header
  const memberCols = cols.filter(c => c.kind === 'member')
  const externalCols = cols.filter(c => c.kind === 'external')
  const expenseCols = cols.filter(c => c.kind === 'expense')
  const leadingStatCols = cols.filter(c => c.kind === 'stat' && ['revenue', 'invoice', 'receipt', 'refund'].includes(c.statKey ?? ''))
  const trailingStatCols = cols.filter(c => c.kind === 'stat' && ['food', 'pack', 'misc', 'totalExpense', 'balance'].includes(c.statKey ?? ''))

  for (let c = 1; c <= cols[cols.length - 1].index; c++) {
    fillHeader(ws.getRow(1).getCell(c), '', CK_PAPER, false, 'FF000000', 12)
    fillHeader(ws.getRow(2).getCell(c), '', CK_PAPER, false, 'FF000000', 12)
  }
  if (expenseCols.length > 0) {
    // Row 1: 廠商群組（vendor_group），連續相同就 merge
    const vgRanges: Array<{ vg: string; start: number; end: number }> = []
    for (const c of expenseCols) {
      const last = vgRanges[vgRanges.length - 1]
      if (last && last.vg === (c.vendorGroup ?? '')) last.end = c.index
      else vgRanges.push({ vg: c.vendorGroup ?? '', start: c.index, end: c.index })
    }
    for (const r of vgRanges) {
      fillHeader(ws.getRow(1).getCell(r.start), r.vg || '未分類', ckVgColor(r.vg || ''), true, 'FF000000', 14)
      if (r.end > r.start) ws.mergeCells(1, r.start, 1, r.end)
    }
    // Row 2: 單據類型（doc_type），同 vg 內連續相同就 merge
    const docRanges: Array<{ doc: string; vg: string; start: number; end: number }> = []
    for (const c of expenseCols) {
      const key = `${c.vendorGroup ?? ''}|${c.docType ?? ''}`
      const last = docRanges[docRanges.length - 1]
      const lastKey = last ? `${last.vg}|${last.doc}` : ''
      if (last && lastKey === key) last.end = c.index
      else docRanges.push({ doc: c.docType ?? '', vg: c.vendorGroup ?? '', start: c.index, end: c.index })
    }
    for (const r of docRanges) {
      if (!r.doc) continue
      fillHeader(ws.getRow(2).getCell(r.start), r.doc, ckDocColor(r.doc), true, 'FF000000', 12)
      if (r.end > r.start) ws.mergeCells(2, r.start, 2, r.end)
    }
  }

  if (leadingStatCols.length > 0) {
    for (const c of leadingStatCols) {
      if (c.statKey === 'revenue') continue
      fillHeader(ws.getRow(1).getCell(c.index), c.header, headerFill(c), true, headerFontColor(c), 13)
      fillHeader(ws.getRow(2).getCell(c.index), c.statKey === 'invoice' || c.statKey === 'receipt' ? '單據' : '', CK_PAPER, true, 'FF000000', 11)
    }
  }
  if (trailingStatCols.length > 0) {
    const s = trailingStatCols[0].index
    const e = trailingStatCols[trailingStatCols.length - 1].index
    fillHeader(ws.getRow(1).getCell(s), '合計', CK_HEADER_GRAY, true, 'FF000000', 13)
    if (e > s) ws.mergeCells(1, s, 1, e)
    for (const c of trailingStatCols) fillHeader(ws.getRow(2).getCell(c.index), c.header, headerFill(c), true, headerFontColor(c), 11)
  }

  // Row 3 header
  let storeColorIndex = 0
  for (const c of cols) {
    const row3Cell = ws.getRow(HEADER_ROW).getCell(c.index)
    if (c.kind === 'member' || c.kind === 'external') {
      fillHeader(row3Cell, displayHeader(c.header), storeHeaderColor(storeColorIndex++), true, 'FF000000', 20)
      continue
    }
    if (c.kind === 'stat' && c.statKey === 'revenue') {
      fillHeader(row3Cell, '營業額', CK_MONTH_YELLOW, true, 'FF000000', 15)
      continue
    }
    fillHeader(
      row3Cell,
      displayHeader(c.header),
      headerFill(c),
      true,
      headerFontColor(c),
      13,
    )
  }

  // Row 4 月合計
  fillHeader(ws.getRow(TOTAL_ROW).getCell(1), `${monthNum}月`, 'FFFFFF00', true)
  fillHeader(ws.getRow(TOTAL_ROW).getCell(2), '', 'FFFFFF00', true)
  const memberColStart = memberCols[0]?.index
  const memberColEnd = memberCols[memberCols.length - 1]?.index
  const extColStart = externalCols[0]?.index
  const extColEnd = externalCols[externalCols.length - 1]?.index
  const foodExpCols = expenseCols.filter(c => c.category === '食材')
  const packExpCols = expenseCols.filter(c => c.category === '耗材')
  const miscExpCols = expenseCols.filter(c => c.category === '雜項')

  for (const c of cols) {
    if (c.kind === 'date' || c.kind === 'weekday') continue
    const letter = colLetter(c.index)
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    const formula = c.kind === 'stat'
      ? (statFormula(c.statKey, TOTAL_ROW, TOTAL_ROW, memberColStart, memberColEnd, extColStart, extColEnd, expenseCols, foodExpCols, packExpCols, miscExpCols, cols) ?? '0')
      : `SUM(${letter}${DATA_START}:${letter}${DATA_START + daysInMonth - 1})`
    cell.value = { formula } as any
    cell.font = {
      name: CK_FONT,
      size: c.kind === 'member' || c.kind === 'external' || c.statKey === 'revenue' ? 16 : 12,
      bold: true,
      italic: c.kind !== 'member' && c.kind !== 'external' && c.statKey !== 'revenue',
    }
    cell.alignment = { horizontal: 'right', vertical: 'middle', shrinkToFit: false }
    cell.numFmt = '#,##0;-#,##0;"-"'
    cell.border = thinBorder() as ExcelJS.Borders
    if (c.kind === 'member' || c.kind === 'external') {
      const headerCell = ws.getRow(HEADER_ROW).getCell(c.index)
      const fill = (headerCell.fill as any)?.fgColor?.argb ?? CK_PAPER
      setFill(cell, fill)
    } else {
      setFill(cell, CK_MONTH_YELLOW)
    }
  }

  // Row 5+ 每日
  const dayByDate = new Map(monthly.daily.map(d => [d.date, d] as const))
  for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
    const rowNum = DATA_START + dayIdx
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`
    const dd = dayByDate.get(dateStr)
    const dt = new Date(year, monthNum - 1, dayIdx + 1)
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const excelRow = ws.getRow(rowNum)

    for (const c of cols) {
      const cell = excelRow.getCell(c.index)
      if (c.kind === 'date') {
        cell.value = `${monthNum}月${dayIdx + 1}日`
        if (isWeekend) cell.font = { color: { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }, bold: true }
      } else if (c.kind === 'weekday') {
        cell.value = `星期${WEEKDAYS[dow]}`
        if (isWeekend) cell.font = { color: { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }, bold: true }
      } else if (c.kind === 'member' && dd) {
        const v = dd.memberOrders.find(o => o.store_id === c.itemKey)?.amount ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'external' && dd) {
        const v = dd.externalOrders.find(o => o.name === c.itemKey)?.amount ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'expense' && dd) {
        const [cat, , , name] = (c.itemKey ?? '').split('||')
        const v = dd.expenses.filter(e => e.category === cat && e.item_name === name).reduce((s, e) => s + e.amount, 0)
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'stat' && c.statKey) {
        // 每日小計用 SUM range 公式
        const letter = colLetter(c.index)
        const formula = statFormula(c.statKey, rowNum, TOTAL_ROW, memberColStart, memberColEnd, extColStart, extColEnd, expenseCols, foodExpCols, packExpCols, miscExpCols, cols)
        if (formula) cell.value = { formula } as any
        cell.numFmt = '#,##0;-#,##0;'
      }
      const fill = isWeekend ? CK_WEEKEND : columnFill(c)
      styleDataCell(cell, fill, c.kind === 'date' || c.kind === 'weekday' ? 'center' : 'right')
      if (isWeekend) {
        cell.font = {
          ...(cell.font as any),
          name: CK_FONT,
          color: c.kind === 'date' || c.kind === 'weekday'
            ? { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }
            : { argb: 'FF000000' },
          bold: c.kind === 'date' || c.kind === 'weekday',
        }
      }
    }
  }

  // 欄寬（依 header 中文字數動態拉寬，避免字體被壓縮）
  for (const c of cols) {
    const label = displayHeader(c.header ?? '')
    const headerLen = label.length
    const base =
      c.kind === 'date' ? 11 :
      c.kind === 'weekday' ? 10 :
      c.kind === 'stat' ? 12 :
      c.kind === 'expense' ? 11 :
      14
    const maxWidth = c.kind === 'expense' ? 24 : c.kind === 'member' || c.kind === 'external' ? 22 : 16
    const w = Math.min(maxWidth, Math.max(base, headerLen * 2.2 + 4))
    ws.getColumn(c.index).width = w
    ws.getColumn(c.index).alignment = { shrinkToFit: false, wrapText: false, vertical: 'middle' }
  }

  // 舊版 Excel 風格的粗黑分隔線：日期區、店家區、支出區、合計區都清楚切開
  const boundaryCols = new Set<number>([2])
  if (memberCols.length > 0) boundaryCols.add(memberCols[memberCols.length - 1].index)
  if (externalCols.length > 0) boundaryCols.add(externalCols[externalCols.length - 1].index)
  const revenueCol = cols.find(c => c.statKey === 'revenue')?.index
  if (revenueCol) boundaryCols.add(revenueCol)
  if (leadingStatCols.length > 0) boundaryCols.add(leadingStatCols[leadingStatCols.length - 1].index)
  if (trailingStatCols.length > 0) boundaryCols.add(trailingStatCols[trailingStatCols.length - 1].index)
  if (expenseCols.length > 0) {
    boundaryCols.add(expenseCols[expenseCols.length - 1].index)
    for (let i = 0; i < expenseCols.length - 1; i++) {
      const cur = expenseCols[i]
      const next = expenseCols[i + 1]
      if (cur.vendorGroup !== next.vendorGroup || cur.category !== next.category) boundaryCols.add(cur.index)
    }
  }
  const lastCol = cols[cols.length - 1].index
  boundaryCols.add(lastCol)
  for (let rowNum = 1; rowNum <= DATA_START + daysInMonth - 1; rowNum++) {
    for (const col of boundaryCols) applySide(ws.getRow(rowNum).getCell(col), 'right', 'medium')
  }

  ws.getRow(1).height = 30
  ws.getRow(2).height = 28
  ws.getRow(3).height = 36
  ws.getRow(4).height = 28
  for (let i = 1; i <= daysInMonth; i++) ws.getRow(DATA_START + i - 1).height = 24
}

/** 產出「央廚食耗成本」workbook（單月） */
export async function buildCKNativeWorkbook(
  ckStoreId: string, year: number, monthNum: number,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  wb.created = new Date()
  ;(wb as any).calcProperties = { fullCalcOnLoad: true }
  await addCKSheet(wb, ckStoreId, year, monthNum)
  return wb
}

/** 產出「央廚食耗成本」年度 workbook — 年度總覽 + 12 月，共 13 個 sheet */
export async function buildAnnualCKWorkbook(
  ckStoreId: string, year: number,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  wb.created = new Date()
  ;(wb as any).calcProperties = { fullCalcOnLoad: true }

  // 年度總覽 sheet
  addCKAnnualOverviewSheet(wb, year)

  // 12 個月 sheet
  for (let m = 1; m <= 12; m++) {
    await addCKSheet(wb, ckStoreId, year, m)
  }

  return wb
}

/** 年度總覽：12 個月的核心數字橫向排列 */
function addCKAnnualOverviewSheet(wb: ExcelJS.Workbook, year: number) {
  const ws = wb.addWorksheet('年度總覽', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })

  fillHeader(ws.getRow(1).getCell(1), `央廚 ${year} 年度總覽`, CK_PAPER, true, 'FF000000', 16)
  ws.mergeCells(1, 1, 1, 14)

  const headers = ['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '全年合計']
  headers.forEach((h, i) => fillHeader(ws.getRow(3).getCell(i + 1), h, CK_HEADER_GRAY, true, 'FF000000', 13))

  const sectionRows = new Set<number>()
  const metricRows: Record<string, number> = {}
  const rows: Array<
    | { type: 'section'; label: string; fill: string }
    | { type: 'metric'; label: string; sheetHeader: string; fill: string; key: string; numFmt?: string }
    | { type: 'ratio'; label: string; numerator: string; denominator: string; fill: string; key: string }
  > = [
    { type: 'section', label: '店家與單據', fill: CK_TOTAL_ORANGE },
    { type: 'metric', label: '營業額', sheetHeader: '總收入', fill: CK_PAPER, key: 'revenue' },
    { type: 'metric', label: '總發票', sheetHeader: '總發票', fill: 'FFD9E2F3', key: 'invoice' },
    { type: 'metric', label: '總收據', sheetHeader: '總收據', fill: 'FFFCE4D6', key: 'receipt' },
    { type: 'metric', label: '梁平退稅', sheetHeader: '梁平退稅', fill: CK_GREEN, key: 'refund' },
    { type: 'section', label: '成本分類', fill: 'FFDDD9C4' },
    { type: 'metric', label: '食材', sheetHeader: '食材', fill: CK_ORANGE, key: 'food' },
    { type: 'metric', label: '耗材', sheetHeader: '耗材', fill: 'FF4BACC6', key: 'pack' },
    { type: 'metric', label: '雜項', sheetHeader: '雜項', fill: CK_TOTAL_ORANGE, key: 'misc' },
    { type: 'metric', label: '總支出', sheetHeader: '總支出', fill: CK_BLACK, key: 'totalExpense' },
    { type: 'section', label: '成果指標', fill: CK_HEADER_GRAY },
    { type: 'metric', label: '淨額', sheetHeader: '淨額', fill: CK_MONTH_YELLOW, key: 'balance' },
    { type: 'ratio', label: '成本率（總支出 / 營業額）', numerator: 'totalExpense', denominator: 'revenue', fill: 'FFEFEFEF', key: 'costRate' },
    { type: 'ratio', label: '食材率', numerator: 'food', denominator: 'revenue', fill: 'FFFCE4D6', key: 'foodRate' },
    { type: 'ratio', label: '耗材率', numerator: 'pack', denominator: 'revenue', fill: 'FFDCEBF3', key: 'packRate' },
    { type: 'ratio', label: '雜項率', numerator: 'misc', denominator: 'revenue', fill: 'FFFDE9D9', key: 'miscRate' },
  ]

  let currentRow = 4
  for (const row of rows) {
    if (row.type === 'section') {
      sectionRows.add(currentRow)
      fillHeader(ws.getRow(currentRow).getCell(1), row.label, row.fill, true, 'FF000000', 13)
      ws.mergeCells(currentRow, 1, currentRow, 14)
      currentRow += 1
      continue
    }

    metricRows[row.key] = currentRow
    fillHeader(ws.getRow(currentRow).getCell(1), row.label, row.fill, true, row.fill === CK_BLACK ? 'FFFFFFFF' : 'FF000000', 12)
    for (let m = 1; m <= 12; m++) {
      const cell = ws.getRow(currentRow).getCell(m + 1)
      if (row.type === 'metric') {
        const sheetName = `${m}月央廚食耗`
        cell.value = { formula: `IFERROR(INDEX('${sheetName}'!$4:$4,MATCH("${row.sheetHeader}",'${sheetName}'!$3:$3,0)),0)` } as any
        cell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
      } else {
        const numeratorRow = metricRows[row.numerator]
        const denominatorRow = metricRows[row.denominator]
        cell.value = { formula: `IFERROR(${colLetter(m + 1)}${numeratorRow}/${colLetter(m + 1)}${denominatorRow},0)` } as any
        cell.numFmt = '0.0%'
      }
      cell.alignment = { horizontal: 'right', vertical: 'middle', shrinkToFit: false }
      cell.font = { name: CK_FONT, size: 12, italic: row.type === 'ratio' }
      cell.border = thinBorder() as ExcelJS.Borders
      setFill(cell, row.fill === CK_BLACK ? 'FFEFEFEF' : row.fill)
    }

    const totalCell = ws.getRow(currentRow).getCell(14)
    if (row.type === 'metric') {
      totalCell.value = { formula: `SUM(B${currentRow}:M${currentRow})` } as any
      totalCell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
    } else {
      const numeratorRow = metricRows[row.numerator]
      const denominatorRow = metricRows[row.denominator]
      totalCell.value = { formula: `IFERROR(N${numeratorRow}/N${denominatorRow},0)` } as any
      totalCell.numFmt = '0.0%'
    }
    totalCell.font = { name: CK_FONT, size: 12, bold: true, italic: row.type === 'ratio' }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle', shrinkToFit: false }
    totalCell.border = thinBorder() as ExcelJS.Borders
    setFill(totalCell, CK_PAPER)
    currentRow += 1
  }

  ws.getColumn(1).width = 28
  for (let c = 2; c <= 14; c++) {
    ws.getColumn(c).width = c === 14 ? 14 : 12
    ws.getColumn(c).alignment = { shrinkToFit: false, vertical: 'middle' }
  }
  ws.getRow(1).height = 32
  ws.getRow(3).height = 32
  for (let r = 4; r < currentRow; r++) ws.getRow(r).height = sectionRows.has(r) ? 28 : 24
  for (let r = 1; r < currentRow; r++) {
    applySide(ws.getRow(r).getCell(1), 'right', 'medium')
    applySide(ws.getRow(r).getCell(14), 'right', 'medium')
  }
}
