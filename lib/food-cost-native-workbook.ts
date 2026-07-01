/**
 * 系統原生產出「食耗成本」xlsx（無模板）
 *
 * Layout 對齊使用者原本各店 Excel「N 月食耗成本」sheet：
 *   Row 1: 特殊統計標題 + 廠商群組 (vendor_group)
 *   Row 2: 特殊統計數字 + 單據類型 (doc_type)
 *   Row 3: 收入欄 / 統計欄 / 品項欄 title
 *   Row 4: 月合計（SUMIFS 對齊 category / SUM 對齊欄位）
 *   Row 5..: 每日資料
 *
 * 完全依 aggregator + store_items_resolver 動態產出欄位，無 hardcoded 模板。
 */
import ExcelJS from 'exceljs'
import { getMonthlyStats, type DailyStats, type MonthlyStats } from '@/lib/store-aggregator'
import { getStoreItemsResolved, type ResolvedStoreItem } from '@/lib/store-items-resolver'
import { createAdminClient } from '@/lib/supabase/admin'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

interface StoreInfo {
  id: string
  name: string
  ichef_uber_linked?: boolean
  uber_accounts?: string[]
  twpay_enabled?: boolean
  panda_enabled?: boolean
  online_enabled?: boolean
  online_cash_enabled?: boolean
}

interface ColumnDef {
  index: number       // 1-based Excel column
  header: string      // Row 3 (item name / income column title)
  vendorGroup?: string   // Row 1 (品項欄專用)
  docType?: string       // Row 2 (品項欄專用)
  category?: '食材' | '耗材' | '雜項'   // 用於 SUMIFS
  kind: 'date' | 'weekday' | 'spacer' | 'income' | 'stat' | 'item'
  incomeKey?: string  // 'pos' | 'twpay' | 'panda' | 'online' | 'online_cash' | 'uber:<account>' | 'after_deduct' | 'onsite' | 'actual' | 'ck' | 'variance' | 'revenue'
  statKey?: 'total' | 'food' | 'pack' | 'misc'
}

/** Build the column layout for a store */
function buildLayout(store: StoreInfo, items: ResolvedStoreItem[]): ColumnDef[] {
  const cols: ColumnDef[] = []
  let idx = 1
  cols.push({ index: idx++, header: '日期', kind: 'date' })
  cols.push({ index: idx++, header: '星期', kind: 'weekday' })

  // 收入區
  cols.push({ index: idx++, header: '(手動)POS', kind: 'income', incomeKey: 'pos' })
  if (store.twpay_enabled) cols.push({ index: idx++, header: 'TWPAY', kind: 'income', incomeKey: 'twpay' })
  if (store.panda_enabled) cols.push({ index: idx++, header: '熊貓', kind: 'income', incomeKey: 'panda' })
  if (store.online_enabled) cols.push({ index: idx++, header: '線上', kind: 'income', incomeKey: 'online' })
  if (store.online_cash_enabled) cols.push({ index: idx++, header: '線上現金', kind: 'income', incomeKey: 'online_cash' })
  for (const acc of store.uber_accounts ?? []) {
    cols.push({ index: idx++, header: acc, kind: 'income', incomeKey: `uber:${acc}` })
  }
  cols.push({ index: idx++, header: '扣除後的$', kind: 'income', incomeKey: 'after_deduct' })
  cols.push({ index: idx++, header: '現場', kind: 'income', incomeKey: 'onsite' })
  cols.push({ index: idx++, header: '(手動)實際$', kind: 'income', incomeKey: 'actual' })
  cols.push({ index: idx++, header: '配送(月底結)', kind: 'income', incomeKey: 'ck' })
  cols.push({ index: idx++, header: '結果', kind: 'income', incomeKey: 'variance' })
  cols.push({ index: idx++, header: '營業額', kind: 'income', incomeKey: 'revenue' })

  // Spacer + 4 統計欄
  cols.push({ index: idx++, header: '', kind: 'spacer' })
  cols.push({ index: idx++, header: '總', kind: 'stat', statKey: 'total' })
  cols.push({ index: idx++, header: '食材', kind: 'stat', statKey: 'food' })
  cols.push({ index: idx++, header: '耗材', kind: 'stat', statKey: 'pack' })
  cols.push({ index: idx++, header: '雜項', kind: 'stat', statKey: 'misc' })

  // 品項欄（依 vendor_group sort_order → item sort_order 排）
  const sortedItems = [...items].sort((a, b) =>
    a.vendor_group_sort_order - b.vendor_group_sort_order
    || a.sort_order - b.sort_order
    || a.name.localeCompare(b.name)
  )
  for (const it of sortedItems) {
    cols.push({
      index: idx++,
      header: it.name,
      vendorGroup: it.vendor_group,
      docType: it.doc_type ?? '',
      category: it.category,
      kind: 'item',
    })
  }

  return cols
}

function colLetter(colNum: number): string {
  let s = ''
  let n = colNum
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function fillHeaderCell(cell: ExcelJS.Cell, text: string, fillArgb?: string, fontColor = 'FF000000', bold = false) {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.font = { name: 'Calibri', size: 10, bold, color: { argb: fontColor } }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  }
  if (fillArgb) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  }
}

/** 產出「食耗成本」workbook */
export async function buildFoodCostNativeWorkbook(
  storeId: string,
  year: number,
  monthNum: number,
): Promise<ExcelJS.Workbook> {
  const admin = createAdminClient()
  const { data: storeRow } = await admin.from('stores')
    .select('id, name, ichef_uber_linked, uber_accounts, twpay_enabled, panda_enabled, online_enabled, online_cash_enabled')
    .eq('id', storeId).single()
  const store = (storeRow ?? { id: storeId, name: '' }) as StoreInfo
  const items = await getStoreItemsResolved(storeId)
  const monthly = await getMonthlyStats(storeId, year, monthNum)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  wb.created = new Date()
  ;(wb as any).calcProperties = { fullCalcOnLoad: true }

  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
  })

  const cols = buildLayout(store, items)
  const totalCols = cols.length
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const HEADER_ROW = 3           // 「日期/POS/...」在 row 3
  const TOTAL_ROW = 4            // 月合計
  const DATA_START = 5           // 每日資料

  // ── Row 1 / Row 2：品項欄的 vendor_group / doc_type ──
  // 加 merge cells: 連續相同 vendor_group 的品項欄合併
  const itemCols = cols.filter(c => c.kind === 'item')
  const vgRanges: Array<{ vg: string; start: number; end: number }> = []
  for (const c of itemCols) {
    const last = vgRanges[vgRanges.length - 1]
    if (last && last.vg === c.vendorGroup) {
      last.end = c.index
    } else {
      vgRanges.push({ vg: c.vendorGroup ?? '', start: c.index, end: c.index })
    }
  }
  for (const r of vgRanges) {
    const cell = ws.getRow(1).getCell(r.start)
    fillHeaderCell(cell, r.vg, 'FFFDE9D9', 'FF000000', true)
    if (r.end > r.start) {
      ws.mergeCells(1, r.start, 1, r.end)
    }
  }

  const docRanges: Array<{ doc: string; start: number; end: number }> = []
  for (const c of itemCols) {
    const key = `${c.vendorGroup}|${c.docType}`
    const last = docRanges[docRanges.length - 1]
    const lastKey = last ? `${itemCols.find(x => x.index === last.start)?.vendorGroup}|${last.doc}` : null
    if (last && lastKey === key) {
      last.end = c.index
    } else {
      docRanges.push({ doc: c.docType ?? '', start: c.index, end: c.index })
    }
  }
  for (const r of docRanges) {
    if (!r.doc) continue
    const cell = ws.getRow(2).getCell(r.start)
    fillHeaderCell(cell, r.doc, 'FFC6D9F0', 'FF000000')
    if (r.end > r.start) {
      ws.mergeCells(2, r.start, 2, r.end)
    }
  }

  // Row 1 上方統計欄：梁平退稅（放在「總」欄上）
  const totalStatCol = cols.find(c => c.statKey === 'total')?.index
  if (totalStatCol) {
    fillHeaderCell(ws.getRow(1).getCell(totalStatCol - 1), '梁平退稅', 'FFC6EFCE', 'FF000000', true)
    fillHeaderCell(ws.getRow(1).getCell(totalStatCol), String(Math.round(monthly.liangpingRefund)), 'FFFFFFCC', 'FF000000', true)
    // Row 2 : 總發票 / 總收據
    fillHeaderCell(ws.getRow(2).getCell(totalStatCol - 1), '總發票', 'FFC6D9F0', 'FF000000')
    fillHeaderCell(ws.getRow(2).getCell(totalStatCol), String(Math.round(monthly.totalInvoice)), 'FFFFFFCC', 'FF000000')
    const foodCol = cols.find(c => c.statKey === 'food')?.index
    if (foodCol) {
      fillHeaderCell(ws.getRow(2).getCell(foodCol), '總收據', 'FFFCE4D6', 'FF000000')
      fillHeaderCell(ws.getRow(2).getCell(foodCol + 1), String(Math.round(monthly.totalReceipt)), 'FFFFFFCC', 'FF000000')
    }
  }

  // ── Row 3 : header ──
  for (const c of cols) {
    let fill = 'FFEEEEEE'
    if (c.kind === 'income') fill = 'FFFDE9D9'
    else if (c.kind === 'stat') fill = 'FFF79544'
    else if (c.kind === 'item') fill = 'FFBFBFBF'
    fillHeaderCell(ws.getRow(HEADER_ROW).getCell(c.index), c.header, fill, 'FF000000', true)
  }

  // ── Row 4 : 月份標題 + 月合計 ──
  fillHeaderCell(ws.getRow(TOTAL_ROW).getCell(1), `${monthNum}月`, 'FFFFFF00', 'FF000000', true)
  for (const c of cols) {
    if (c.kind === 'date' || c.kind === 'weekday' || c.kind === 'spacer') continue
    const letter = colLetter(c.index)
    const formula = `SUM(${letter}${DATA_START}:${letter}${DATA_START + daysInMonth - 1})`
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    cell.value = { formula } as any
    cell.font = { name: 'Calibri', size: 10, bold: true, italic: true }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.numFmt = '#,##0;-#,##0;"-"'
    if (c.kind === 'stat') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    }
  }

  // ── Row 5+ : 每日資料 ──
  const dayByDate = new Map(monthly.daily.map(d => [d.date, d] as const))
  for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
    const rowNum = DATA_START + dayIdx
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`
    const dd = dayByDate.get(dateStr)
    const excelRow = ws.getRow(rowNum)

    for (const c of cols) {
      const cell = excelRow.getCell(c.index)
      if (c.kind === 'date') {
        cell.value = `${monthNum}月${dayIdx + 1}日`
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (c.kind === 'weekday') {
        const dt = new Date(year, monthNum - 1, dayIdx + 1)
        cell.value = `星期${WEEKDAYS[dt.getDay()]}`
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (c.kind === 'income' && dd && c.incomeKey) {
        const v = readIncomeValue(dd, c.incomeKey)
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'stat' && dd && c.statKey) {
        const v = c.statKey === 'total' ? dd.totalCost
          : c.statKey === 'food' ? dd.food
          : c.statKey === 'pack' ? dd.pack
          : dd.misc
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'item' && dd) {
        const v = dd.items[c.header] ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      }
    }
  }

  // ── 欄寬 ──
  for (const c of cols) {
    const width = c.kind === 'date' ? 10 : c.kind === 'weekday' ? 8 : c.kind === 'income' ? 12 : c.kind === 'stat' ? 12 : 10
    ws.getColumn(c.index).width = width
  }

  return wb
}

function readIncomeValue(dd: DailyStats, key: string): number {
  switch (key) {
    case 'pos': return dd.pos
    case 'twpay': return dd.twpay
    case 'panda': return dd.panda
    case 'online': return dd.online
    case 'online_cash': return dd.online_cash
    case 'after_deduct': return dd.after_deduct
    case 'onsite': return dd.onsite
    case 'actual': return dd.actual
    case 'ck': return dd.ck
    case 'variance': return dd.variance
    case 'revenue': return dd.revenue
    default:
      if (key.startsWith('uber:')) return dd.uber[key.slice(5)] ?? 0
      return 0
  }
}
