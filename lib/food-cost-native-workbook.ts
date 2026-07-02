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
import { type ResolvedStoreItem } from '@/lib/store-items-resolver'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'
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
function buildLayout(store: StoreInfo, items: ResolvedStoreItem[], handwriteAccounts: string[] = []): ColumnDef[] {
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
  // 手寫（依當月實際出現的 account_name 動態加欄）
  for (const acc of handwriteAccounts) {
    cols.push({ index: idx++, header: acc ? `手寫(${acc})` : '手寫', kind: 'income', incomeKey: `handwrite:${acc}` })
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

  // 品項欄排序：預設 category 優先（食→耗→雜分區），但**允許 vg 標記為「跨 category 合併」**
  // 標記後該 vg 的所有品項會連續顯示（不被 category 拆散）
  const catOrder: Record<string, number> = { '食材': 0, '耗材': 1, '雜項': 2 }
  const mergedVgs = new Set(
    items.filter(i => i.vg_merge_across_category).map(i => i.vendor_group)
  )
  const sortedItems = [...items].sort((a, b) => {
    const aMerge = mergedVgs.has(a.vendor_group)
    const bMerge = mergedVgs.has(b.vendor_group)
    // 若兩者都在 merge vg 且同 vg → 直接 vg 內連續排
    if (aMerge && bMerge && a.vendor_group === b.vendor_group) {
      return (catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3)
        || (a.sort_order - b.sort_order)
        || a.name.localeCompare(b.name)
    }
    // 兩者都 merge 但不同 vg → 依 vg_sort_order
    if (aMerge && bMerge) {
      return (a.vendor_group_sort_order - b.vendor_group_sort_order)
        || a.vendor_group.localeCompare(b.vendor_group)
    }
    // 一個 merge 一個沒 → merge 的看 vg_sort_order；非 merge 的按 category 分區
    // 統一用 (category, vg_sort_order, sort_order) — merge vg 靠 vg_sort_order 排到定位
    return ((catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3))
      || (a.vendor_group_sort_order - b.vendor_group_sort_order)
      || (a.sort_order - b.sort_order)
      || a.name.localeCompare(b.name)
  })
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

function fillHeaderCell(cell: ExcelJS.Cell, text: string, fillArgb?: string, fontColor = 'FF000000', bold = false, size = 12) {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.font = { name: 'Calibri', size, bold, color: { argb: fontColor } }
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

// vendor_group 顏色調色盤（Excel Row 1 每個廠商群組不同色）
const VG_PALETTE = [
  'FFFDE9D9', // 橘 (央廚配送)
  'FFDCEBF3', // 藍 (菜商)
  'FFE2EFDA', // 綠 (振源)
  'FFFFF2CC', // 黃 (蛋)
  'FFF4CCCC', // 粉 (小雲)
  'FFEAD1DC', // 紫粉 (雜貨)
  'FFC9DAF8', // 淺藍 (免洗)
  'FFD9EAD3', // 淺綠 (退稅)
  'FFFCE5CD', // 米色 (Uber)
  'FFEFEFEF', // 灰 (惠敘)
  'FFFDEBD0', // 淺橘 (翁師傅)
  'FFD5E8D4', // 綠 (達特)
]
function vgColor(vgName: string): string {
  // 依名稱穩定 hash → palette index
  let h = 0
  for (let i = 0; i < vgName.length; i++) h = (h * 31 + vgName.charCodeAt(i)) >>> 0
  return VG_PALETTE[h % VG_PALETTE.length]
}
// doc_type 顏色（Excel Row 2）— 較淺的變體
const DOC_PALETTE: Record<string, string> = {
  '發票':   'FFD9E2F3',
  '收據':   'FFFCE4D6',
  '估價單': 'FFE2EFDA',
  '公司開': 'FFD9E2F3',
  '梁鑫開': 'FFEAD1DC',
  '府中開': 'FFFFF2CC',
}
function docColor(doc: string): string {
  return DOC_PALETTE[doc] ?? 'FFF2F2F2'
}

/** 一次拉店家 + 品項，共用於單月/年度匯出 */
async function loadStoreContext(storeId: string) {
  const admin = createAdminClient()
  const { data: storeRow } = await admin.from('stores')
    .select('id, name, ichef_uber_linked, uber_accounts, twpay_enabled, panda_enabled, online_enabled, online_cash_enabled')
    .eq('id', storeId).single()
  const store = (storeRow ?? { id: storeId, name: '' }) as StoreInfo
  // 用 item_column_mappings 撈品項清單（作為 xlsx layout source of truth）
  // → xlsx 內容 100% 反映品項對應管理設定，不受 store_items orphan 影響
  const items = await getStoreItemsFromMappings(storeId)
  return { store, items }
}

/** 在既有 workbook 上加一個「N 月食耗成本」sheet */
export async function addFoodCostSheet(
  wb: ExcelJS.Workbook,
  store: StoreInfo,
  items: ResolvedStoreItem[],
  year: number,
  monthNum: number,
): Promise<void> {
  const monthly = await getMonthlyStats(store.id, year, monthNum)

  const handwriteAccounts = Array.from(new Set(
    monthly.daily.flatMap(d => Object.keys(d.handwrite))
  )).sort()

  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
  })

  const cols = buildLayout(store, items, handwriteAccounts)
  const totalCols = cols.length
  const daysInMonth = new Date(year, monthNum, 0).getDate()

  // 計算食材／耗材／雜項品項欄的 col range（用來產出每日 stat 欄的 SUM range 公式）
  // 按 vg 排序後，同 category 品項可能不連續 → 用「列出所有品項 col」明列相加，
  // 而非 SUM range（避免夾雜非該 category 的品項）
  function categoryCols(cat: '食材' | '耗材' | '雜項'): number[] {
    return cols.filter(c => c.kind === 'item' && c.category === cat).map(c => c.index)
  }
  const foodCols = categoryCols('食材')
  const packCols = categoryCols('耗材')
  const miscCols = categoryCols('雜項')

  function catSumFormula(catCols: number[], rowNum: number): string | null {
    if (!catCols.length) return null
    // 用 SUM(A5,B5,E5,...) 明列，Excel 支援
    const refs = catCols.map(i => `${colLetter(i)}${rowNum}`).join(',')
    return `SUM(${refs})`
  }
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
    fillHeaderCell(cell, r.vg, vgColor(r.vg), 'FF000000', true, 13)
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
    fillHeaderCell(cell, r.doc, docColor(r.doc), 'FF000000', true, 12)
    if (r.end > r.start) {
      ws.mergeCells(2, r.start, 2, r.end)
    }
  }

  // Row 1 上方統計欄：梁平退稅 / 總發票 / 總收據
  // 用 SUMIFS 公式指向品項區 Row 4 月合計，Excel 打開會動態重算
  const totalStatCol = cols.find(c => c.statKey === 'total')?.index
  if (totalStatCol && itemCols.length > 0) {
    const itemStart = colLetter(itemCols[0].index)
    const itemEnd = colLetter(itemCols[itemCols.length - 1].index)
    const totalRange = `${itemStart}${TOTAL_ROW}:${itemEnd}${TOTAL_ROW}`
    const docRow2Range = `${itemStart}2:${itemEnd}2`
    const vgRow1Range = `${itemStart}1:${itemEnd}1`

    // 梁平退稅 = doc=發票 且 vg=退稅
    fillHeaderCell(ws.getRow(1).getCell(totalStatCol - 1), '梁平退稅', 'FFC6EFCE', 'FF000000', true)
    const cellRefund = ws.getRow(1).getCell(totalStatCol)
    cellRefund.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"發票",${vgRow1Range},"退稅")` } as any
    cellRefund.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
    cellRefund.font = { name: 'Calibri', size: 10, bold: true }
    cellRefund.alignment = { horizontal: 'center', vertical: 'middle' }
    cellRefund.numFmt = '#,##0;-#,##0;"-"'

    // 總發票 = 所有 doc=發票
    fillHeaderCell(ws.getRow(2).getCell(totalStatCol - 1), '總發票', 'FFC6D9F0', 'FF000000')
    const cellInv = ws.getRow(2).getCell(totalStatCol)
    cellInv.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"發票")` } as any
    cellInv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
    cellInv.alignment = { horizontal: 'center', vertical: 'middle' }
    cellInv.numFmt = '#,##0;-#,##0;"-"'

    // 總收據 = 所有 doc=收據
    const foodCol = cols.find(c => c.statKey === 'food')?.index
    if (foodCol) {
      fillHeaderCell(ws.getRow(2).getCell(foodCol), '總收據', 'FFFCE4D6', 'FF000000')
      const cellRec = ws.getRow(2).getCell(foodCol + 1)
      cellRec.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"收據")` } as any
      cellRec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
      cellRec.alignment = { horizontal: 'center', vertical: 'middle' }
      cellRec.numFmt = '#,##0;-#,##0;"-"'
    }
  }

  // ── Row 3 : header（依 category 給不同底色，接近原檔） ──
  for (const c of cols) {
    let fill = 'FFEEEEEE'
    let fontColor = 'FF000000'
    if (c.kind === 'income') {
      // POS 粉紅、TWPAY/Panda/Online 各自色、扣除/現場/實際/配送/結果/營業額 = 橘系
      const k = c.incomeKey ?? ''
      if (k === 'pos') fill = 'FFFDE9D9'
      else if (k === 'twpay') fill = 'FFF4CCCC'
      else if (k === 'panda') fill = 'FFEAD1DC'
      else if (k === 'online' || k === 'online_cash') fill = 'FFC9DAF8'
      else if (k.startsWith('uber:')) fill = 'FFD9EAD3'
      else if (k.startsWith('handwrite:')) fill = 'FFFFE599'
      else if (k === 'after_deduct') fill = 'FFFDE9D9'
      else if (k === 'onsite') fill = 'FFFCE4D6'
      else if (k === 'actual') fill = 'FFDA9694'
      else if (k === 'ck') fill = 'FFFDE9D9'
      else if (k === 'variance') fill = 'FFFFFF00'
      else if (k === 'revenue') fill = 'FFFFFF00'
    } else if (c.kind === 'stat') {
      fill = c.statKey === 'total' ? 'FF000000' : 'FFF79544'
      if (c.statKey === 'total') fontColor = 'FFFFFFFF'
    } else if (c.kind === 'item') {
      if (c.category === '食材') fill = 'FFBFBFBF'
      else if (c.category === '耗材') fill = 'FFC6D9F0'
      else fill = 'FFDDD9C4'
    } else if (c.kind === 'date' || c.kind === 'weekday') {
      fill = 'FFBFBFBF'
    }
    fillHeaderCell(ws.getRow(HEADER_ROW).getCell(c.index), c.header, fill, fontColor, true)
  }

  // ── Row 4 : 月份標題 + 月合計 ──
  fillHeaderCell(ws.getRow(TOTAL_ROW).getCell(1), `${monthNum}月`, 'FFFFFF00', 'FF000000', true)
  for (const c of cols) {
    if (c.kind === 'date' || c.kind === 'weekday' || c.kind === 'spacer') continue
    const letter = colLetter(c.index)
    const formula = `SUM(${letter}${DATA_START}:${letter}${DATA_START + daysInMonth - 1})`
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    cell.value = { formula } as any
    cell.font = { name: 'Calibri', size: 12, bold: true, italic: true }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.numFmt = '#,##0;-#,##0;"-"'
    if (c.kind === 'stat') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
    }
  }

  // ── Row 5+ : 每日資料 ──
  // 稅金 fallback：aggregator 產生「{vg}稅金」key，若 xlsx 沒該欄，累加到「其他稅金」
  const itemNames = new Set(cols.filter(c => c.kind === 'item').map(c => c.header))
  const fallbackTaxItem = itemNames.has('其他稅金') ? '其他稅金' : (itemNames.has('免洗稅金') ? '免洗稅金' : null)
  function normalizeDayItems(items: Record<string, number>): Record<string, number> {
    if (!fallbackTaxItem) return items
    const next: Record<string, number> = { ...items }
    for (const [key, val] of Object.entries(items)) {
      // key 如「小雲稅金」「菜商稅金」等，若對應品項不存在 → 累加到 fallback
      if (key.endsWith('稅金') && !itemNames.has(key)) {
        next[fallbackTaxItem] = (next[fallbackTaxItem] ?? 0) + val
        delete next[key]
      }
    }
    return next
  }

  const dayByDate = new Map(monthly.daily.map(d => [d.date, d] as const))
  for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
    const rowNum = DATA_START + dayIdx
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayIdx + 1).padStart(2, '0')}`
    const dd = dayByDate.get(dateStr)
    // 稅金 fallback
    if (dd) dd.items = normalizeDayItems(dd.items)
    const dt = new Date(year, monthNum - 1, dayIdx + 1)
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const excelRow = ws.getRow(rowNum)

    for (const c of cols) {
      const cell = excelRow.getCell(c.index)
      // Data row 統一字體大小
      if (c.kind !== 'spacer') {
        cell.font = { name: 'Calibri', size: 12,
          color: isWeekend && (c.kind === 'date' || c.kind === 'weekday')
            ? { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }
            : { argb: 'FF000000' },
          bold: isWeekend && (c.kind === 'date' || c.kind === 'weekday'),
        }
      }
      if (c.kind === 'date') {
        cell.value = `${monthNum}月${dayIdx + 1}日`
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (c.kind === 'weekday') {
        cell.value = `星期${WEEKDAYS[dow]}`
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (c.kind === 'income' && dd && c.incomeKey) {
        const v = readIncomeValue(dd, c.incomeKey)
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'stat' && c.statKey) {
        // 用 SUM range 公式，Excel 開會動態重算
        const foodCol = cols.find(x => x.statKey === 'food')
        const packCol = cols.find(x => x.statKey === 'pack')
        const miscCol = cols.find(x => x.statKey === 'misc')
        let formula: string | null = null
        if (c.statKey === 'food') {
          formula = catSumFormula(foodCols, rowNum)
        } else if (c.statKey === 'pack') {
          formula = catSumFormula(packCols, rowNum)
        } else if (c.statKey === 'misc') {
          formula = catSumFormula(miscCols, rowNum)
        } else if (c.statKey === 'total' && foodCol && packCol && miscCol) {
          formula = `${colLetter(foodCol.index)}${rowNum}+${colLetter(packCol.index)}${rowNum}+${colLetter(miscCol.index)}${rowNum}`
        }
        if (formula) cell.value = { formula } as any
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'item' && dd) {
        const v = dd.items[c.header] ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      }
    }
  }

  // ── 欄寬（字體變大同步拉寬） ──
  for (const c of cols) {
    const width = c.kind === 'date' ? 12 : c.kind === 'weekday' ? 10 : c.kind === 'income' ? 14 : c.kind === 'stat' ? 14 : 12
    ws.getColumn(c.index).width = width
  }
  // ── Row 高度加大以容納較大字體 ──
  ws.getRow(1).height = 24
  ws.getRow(2).height = 22
  ws.getRow(HEADER_ROW).height = 24
  ws.getRow(TOTAL_ROW).height = 22
  for (let i = 0; i < daysInMonth; i++) {
    ws.getRow(DATA_START + i).height = 20
  }
}

/** 產出單月「食耗成本」workbook */
export async function buildFoodCostNativeWorkbook(
  storeId: string,
  year: number,
  monthNum: number,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  wb.created = new Date()
  ;(wb as any).calcProperties = { fullCalcOnLoad: true }
  const { store, items } = await loadStoreContext(storeId)
  await addFoodCostSheet(wb, store, items, year, monthNum)
  return wb
}

/** 產出年度「食耗成本」workbook — 年度總覽 + 1~12 月食耗成本，共 13 個 sheet */
export async function buildAnnualFoodCostWorkbook(
  storeId: string,
  year: number,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  wb.created = new Date()
  ;(wb as any).calcProperties = { fullCalcOnLoad: true }
  const { store, items } = await loadStoreContext(storeId)

  // 先加「年度總覽」sheet（引用各 month sheet 的月合計）
  addAnnualOverviewSheet(wb, store, year)

  // 12 個月 sheet
  for (let m = 1; m <= 12; m++) {
    await addFoodCostSheet(wb, store, items, year, m)
  }

  return wb
}

/** 年度總覽 sheet：12 個月的月合計橫向排列（引用各月份 sheet 的 Row 4） */
function addAnnualOverviewSheet(wb: ExcelJS.Workbook, store: StoreInfo, year: number) {
  const ws = wb.addWorksheet('年度總覽', { views: [{ state: 'frozen', ySplit: 3 }] })

  // Row 1 標題
  fillHeaderCell(ws.getRow(1).getCell(1), `${store.name}  ${year} 年度總覽`, 'FFFFF2CC', 'FF000000', true)
  ws.mergeCells(1, 1, 1, 14)

  // Row 3 header
  const headers = ['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '全年合計']
  headers.forEach((h, i) => fillHeaderCell(ws.getRow(3).getCell(i + 1), h, 'FFBFBFBF', 'FF000000', true))

  // Row 4+ : 各統計 row，引用月份 sheet 的月合計 (Row 4) 對應 cell
  // 月份 sheet 名: '{M}月食耗成本'，月合計欄在 Row 4
  // 「月合計」cell 在 sheet 內 col varies；用 SUMIFS 或直接 hardcode 部分欄
  // 簡化：只列「總／食/耗/雜／營業額／實際／配送／扣除後／現場／總發票／總收據／梁平退稅」
  const rows: Array<{ label: string; sheetCol: 'total' | 'food' | 'pack' | 'misc' | 'revenue' | 'actual' | 'ck' | 'after_deduct' | 'onsite' | 'invoice' | 'receipt' | 'refund' }> = [
    { label: '營業額',   sheetCol: 'revenue' },
    { label: '現場',     sheetCol: 'onsite' },
    { label: '實際',     sheetCol: 'actual' },
    { label: '配送',     sheetCol: 'ck' },
    { label: '扣除後',   sheetCol: 'after_deduct' },
    { label: '總（食+耗+雜）', sheetCol: 'total' },
    { label: '食材',     sheetCol: 'food' },
    { label: '耗材',     sheetCol: 'pack' },
    { label: '雜項',     sheetCol: 'misc' },
    { label: '總發票',   sheetCol: 'invoice' },
    { label: '總收據',   sheetCol: 'receipt' },
    { label: '梁平退稅', sheetCol: 'refund' },
  ]

  // 各月份 sheet 上這些統計欄的 cell 位置不固定（依店家欄位動態算）
  // 這裡使用「跨 sheet reference + 找 headers」的方式：用 INDEX+MATCH 抓
  // 因為 sheet 內 Row 3 是 header，Row 4 是月合計 → 用 INDEX/MATCH 找對應 col
  const headerRefBySheetCol: Record<string, string> = {
    total: '"總"',
    food: '"食材"',
    pack: '"耗材"',
    misc: '"雜項"',
    revenue: '"營業額"',
    actual: '"(手動)實際$"',
    ck: '"配送(月底結)"',
    after_deduct: '"扣除後的$"',
    onsite: '"現場"',
    invoice: '"總發票"',
    receipt: '"總收據"',
    refund: '"梁平退稅"',
  }

  rows.forEach((row, rIdx) => {
    const excelRow = 4 + rIdx
    fillHeaderCell(ws.getRow(excelRow).getCell(1), row.label, 'FFFAFAFA', 'FF000000', true)
    for (let m = 1; m <= 12; m++) {
      const cell = ws.getRow(excelRow).getCell(m + 1)
      const sheetName = `${m}月食耗成本`
      // 「總發票/收據/梁平退稅」在 sheet 上是 Row 1/2 的特殊格 → 用 SUMIF
      let formula: string
      if (row.sheetCol === 'invoice') {
        // 抓月份 sheet 內 "總發票" 那格（假設在 Row 2）— 用 SUMIFS 較穩定
        formula = `SUMIFS('${sheetName}'!$4:$4,'${sheetName}'!$2:$2,"發票")`
      } else if (row.sheetCol === 'receipt') {
        formula = `SUMIFS('${sheetName}'!$4:$4,'${sheetName}'!$2:$2,"收據")`
      } else if (row.sheetCol === 'refund') {
        formula = `SUMIFS('${sheetName}'!$4:$4,'${sheetName}'!$2:$2,"發票",'${sheetName}'!$1:$1,"退稅")`
      } else {
        // 用 INDEX+MATCH 找 header 對應欄的月合計
        formula = `INDEX('${sheetName}'!$4:$4,MATCH(${headerRefBySheetCol[row.sheetCol]},'${sheetName}'!$3:$3,0))`
      }
      cell.value = { formula } as any
      cell.numFmt = '#,##0;-#,##0;"-"'
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
    // 全年合計 = SUM 該 row 12 個月
    const totalCell = ws.getRow(excelRow).getCell(14)
    totalCell.value = { formula: `SUM(B${excelRow}:M${excelRow})` } as any
    totalCell.numFmt = '#,##0;-#,##0;"-"'
    totalCell.font = { bold: true }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' }
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  })

  // 欄寬
  ws.getColumn(1).width = 18
  for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 12
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
      if (key.startsWith('handwrite:')) return dd.handwrite[key.slice(10)] ?? 0
      return 0
  }
}
