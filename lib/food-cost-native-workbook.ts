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
import { getDisplayPosTotal, getMonthlyStats, type DailyStats, type MonthlyStats } from '@/lib/store-aggregator'
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
  header: string      // Row 3 (顯示名，可能剝掉 vg 前綴)
  nameKey?: string    // aggregator items 抓值用的完整 item_name
  vendorGroup?: string   // Row 1 (品項欄專用)
  docType?: string       // Row 2 (品項欄專用)
  category?: '食材' | '耗材' | '雜項'   // 用於 SUMIFS
  isRefund?: boolean  // 是否納入梁平退稅（跟 vg 解耦）
  kind: 'date' | 'weekday' | 'spacer' | 'income' | 'stat' | 'item'
  incomeKey?: string  // 'pos' | 'twpay' | 'panda' | 'online' | 'online_cash' | 'uber:<account>' | 'after_deduct' | 'onsite' | 'actual' | 'ck' | 'variance' | 'revenue'
  statKey?: 'total' | 'food' | 'pack' | 'misc'
}

/** 剝掉 vg 前綴：例「振源滷蛋」→ vg=振源 → 「滷蛋」
 *  但剝掉後長度需 ≥ 2 字元，避免「麵線」→「線」單字誤剝
 */
function displayHeader(name: string, vg?: string): string {
  if (vg && name.startsWith(vg) && name !== vg) {
    const stripped = name.slice(vg.length)
    // 不裁切「-稅金」這類以連字號開頭的名稱，避免顯示殘缺
    if (stripped.length >= 2 && !stripped.startsWith('-')) return stripped
  }
  return name
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
  for (const acc of store.uber_accounts ?? []) {
    cols.push({ index: idx++, header: acc, kind: 'income', incomeKey: `uber:${acc}` })
  }
  if (store.panda_enabled) cols.push({ index: idx++, header: '熊貓', kind: 'income', incomeKey: 'panda' })
  if (store.online_enabled) cols.push({ index: idx++, header: '線上', kind: 'income', incomeKey: 'online' })
  if (store.online_cash_enabled) cols.push({ index: idx++, header: '線上現金', kind: 'income', incomeKey: 'online_cash' })
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
  // 「退稅」品項按名稱推導原廠商，讓同來源在 xlsx 內連續排（自然形成獨立區塊）
  const refundSrc = (name: string) => {
    if (name.endsWith('稅金')) return name.slice(0, -2)
    if (name.endsWith('稅')) return name.slice(0, -1)
    return name
  }
  const sortedItems = [...items].sort((a, b) => {
    // 同 vg=退稅：先按 refundSource 分組（同來源連續），再按 sort_order
    if (a.vendor_group === '退稅' && b.vendor_group === '退稅') {
      const sa = refundSrc(a.name)
      const sb = refundSrc(b.name)
      if (sa !== sb) return sa.localeCompare(sb, 'zh-Hant')
      return (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)
    }
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
    // 排序：vg_sort_order → vg name → category → item.sort_order → name
    // vg 優先確保同一廠商群組的品項永遠連續（不被 category 邊界拆散）
    return (a.vendor_group_sort_order - b.vendor_group_sort_order)
      || a.vendor_group.localeCompare(b.vendor_group)
      || (catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3)
      || (a.sort_order - b.sort_order)
      || a.name.localeCompare(b.name)
  })
  for (const it of sortedItems) {
    cols.push({
      index: idx++,
      header: displayHeader(it.name, it.vendor_group),
      nameKey: it.name,
      vendorGroup: it.vendor_group,
      docType: it.doc_type ?? '',
      category: it.category,
      isRefund: !!it.is_refund,
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

const FONT_FAMILY = 'Microsoft JhengHei'
const HEADER_DEFAULT_SIZE = 14
const DATA_DEFAULT_SIZE = 13
const BLACK = 'FF000000'
const WHITE = 'FFFFFFFF'
const HEADER_GRAY = 'FFBFBFBF'
const MONTH_TOTAL_YELLOW = 'FFFFFF00'
const PALE_YELLOW = 'FFFFFFCC'
const WEEKEND_GRAY = 'FFBFBFBF'
const FOOD_DATA_FILL = 'FFFFFFFF'
const PACK_DATA_FILL = 'FFDCEBF7'
const MISC_DATA_FILL = 'FFFCE4D6'
const REFUND_DATA_FILL = 'FFD9EAD3'
const INCOME_HEADER_FILL = 'FFFFC000'
const UBER_FILL = 'FF00B050'
const PANDA_FILL = 'FFFF66CC'
const STAT_ORANGE_FILL = 'FFF79544'
const STAT_BLUE_FILL = 'FF4BACC6'
const STAT_MISC_FILL = 'FFF4B183'
const RED_FONT = 'FFFF0000'
const ZERO_NUM_FMT = '#,##0;-#,##0;0'
const BLANK_ZERO_NUM_FMT = '#,##0;-#,##0;'
const RESULT_NUM_FMT = '#,##0;[Red]-#,##0;0'

function fillHeaderCell(cell: ExcelJS.Cell, text: string, fillArgb?: string, fontColor = 'FF000000', bold = false, size = HEADER_DEFAULT_SIZE) {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.font = { name: FONT_FAMILY, size, bold, color: { argb: fontColor } }
  cell.border = {
    top: { style: 'thin', color: { argb: BLACK } },
    bottom: { style: 'thin', color: { argb: BLACK } },
    left: { style: 'thin', color: { argb: BLACK } },
    right: { style: 'thin', color: { argb: BLACK } },
  }
  if (fillArgb) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  }
}

function setSolidFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function setGridBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BLACK } },
    bottom: { style: 'thin', color: { argb: BLACK } },
    left: { style: 'thin', color: { argb: BLACK } },
    right: { style: 'thin', color: { argb: BLACK } },
  }
}

function applyVerticalBorder(cell: ExcelJS.Cell, side: 'left' | 'right', style: 'medium' | 'thick' = 'medium') {
  cell.border = {
    ...(cell.border ?? {}),
    [side]: { style, color: { argb: BLACK } },
  } as any
}

function isUberColumn(c: ColumnDef): boolean {
  const key = c.incomeKey ?? ''
  return key.startsWith('uber:') || /uber/i.test(c.header)
}

function isPandaColumn(c: ColumnDef): boolean {
  return c.incomeKey === 'panda' || c.header.includes('熊貓')
}

function platformFillForColumn(c: ColumnDef): string | null {
  if (isUberColumn(c)) return UBER_FILL
  if (isPandaColumn(c)) return PANDA_FILL
  return null
}

function dataFillForColumn(c: ColumnDef): string | null {
  if (c.kind === 'income') return PALE_YELLOW
  if (c.kind === 'date' || c.kind === 'weekday') return PALE_YELLOW
  if (c.kind === 'spacer') return BLACK
  if (c.kind === 'stat') {
    if (c.statKey === 'food') return 'FFF79646'
    if (c.statKey === 'pack') return STAT_BLUE_FILL
    if (c.statKey === 'misc') return STAT_MISC_FILL
    return WHITE
  }
  if (c.kind === 'item') {
    if (c.isRefund || c.vendorGroup === '退稅') return REFUND_DATA_FILL
    if (c.category === '耗材') return PACK_DATA_FILL
    if (c.category === '雜項') return MISC_DATA_FILL
    return FOOD_DATA_FILL
  }
  return null
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

  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4, showGridLines: false }],
  })

  // 手寫收入已併入「(手動)POS」總營業額；月報視覺沿用舊 Excel，不另外拆手寫欄。
  const cols = buildLayout(store, items, [])
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
  const blankZeroFromCol = cols.find(c => c.kind === 'item' && c.vendorGroup === '央廚配送')?.index ?? Number.POSITIVE_INFINITY
  const numFmtForColumn = (c: ColumnDef) => c.kind === 'item' && c.index >= blankZeroFromCol ? BLANK_ZERO_NUM_FMT : ZERO_NUM_FMT
  const incomeRef = (key: string) => cols.find(c => c.incomeKey === key)?.index
  const posCol = incomeRef('pos')
  const afterDeductCol = incomeRef('after_deduct')
  const actualCol = incomeRef('actual')
  const ckCol = incomeRef('ck')
  const varianceCol = incomeRef('variance')
  const statTotalCol = cols.find(c => c.statKey === 'total')?.index
  const platformIncomeCols = cols
    .filter(c => c.kind === 'income' && (
      c.incomeKey === 'twpay' ||
      c.incomeKey === 'panda' ||
      c.incomeKey === 'online' ||
      c.incomeKey === 'online_cash' ||
      c.incomeKey?.startsWith('uber:')
    ))
    .map(c => c.index)
  const cellRef = (col: number, row: number) => `${colLetter(col)}${row}`
  const sumRefs = (colIndexes: number[], row: number) => {
    if (!colIndexes.length) return '0'
    return `SUM(${colIndexes.map(col => cellRef(col, row)).join(',')})`
  }

  // ── Row 1 / Row 2：品項欄的 vendor_group / doc_type ──
  // 加 merge cells: 連續相同 vendor_group 的品項欄合併
  // 「退稅」vg 特殊：同 vg 內若品項對應不同原廠商 → 拆多個獨立 header
  //   Row 1 都寫「退稅」讓 SUMIFS(vg=退稅) 抓得到總額；用左右粗邊界視覺區分
  const refundSource = (name: string) => {
    if (name.endsWith('稅金')) return name.slice(0, -2)
    if (name.endsWith('稅')) return name.slice(0, -1)
    return name
  }
  const itemCols = cols.filter(c => c.kind === 'item')
  const vgRanges: Array<{ vg: string; source: string | null; start: number; end: number }> = []
  for (const c of itemCols) {
    const vg = c.vendorGroup ?? ''
    const source = vg === '退稅' ? refundSource(c.nameKey ?? c.header) : null
    const last = vgRanges[vgRanges.length - 1]
    const sameGroup = last && last.vg === vg && last.source === source
    if (sameGroup) {
      last.end = c.index
    } else {
      vgRanges.push({ vg, source, start: c.index, end: c.index })
    }
  }
  for (const r of vgRanges) {
    const cell = ws.getRow(1).getCell(r.start)
    fillHeaderCell(cell, r.vg, vgColor(r.vg), 'FF000000', true, 13)
    if (r.end > r.start) {
      ws.mergeCells(1, r.start, 1, r.end)
    }
    // 「退稅」拆多塊時加粗邊界視覺分隔
    if (r.vg === '退稅' && r.source) {
      applyVerticalBorder(ws.getRow(1).getCell(r.start), 'left')
      applyVerticalBorder(ws.getRow(1).getCell(r.end), 'right')
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

    // 梁平退稅 = 所有 is_refund=true 品項的月合計加總（跟 vg 解耦，位置可自由排）
    fillHeaderCell(ws.getRow(1).getCell(totalStatCol - 1), '梁平退稅', 'FFC6EFCE', BLACK, true)
    const cellRefund = ws.getRow(1).getCell(totalStatCol)
    const refundCols = itemCols.filter(c => c.isRefund)
    if (refundCols.length > 0) {
      const refs = refundCols.map(c => `${colLetter(c.index)}${TOTAL_ROW}`).join(',')
      cellRefund.value = { formula: `SUM(${refs})` } as any
    } else {
      // fallback：無勾選任何 is_refund 時，回舊邏輯（doc=發票 且 vg=退稅）
      cellRefund.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"發票",${vgRow1Range},"退稅")` } as any
    }
    setSolidFill(cellRefund, PALE_YELLOW)
    cellRefund.font = { name: FONT_FAMILY, size: 12, bold: true }
    cellRefund.alignment = { horizontal: 'center', vertical: 'middle' }
    cellRefund.numFmt = '#,##0;-#,##0;"-"'

    // 總發票 = 所有 doc=發票
    fillHeaderCell(ws.getRow(2).getCell(totalStatCol - 1), '總發票', 'FFC6D9F0', BLACK)
    const cellInv = ws.getRow(2).getCell(totalStatCol)
    cellInv.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"發票")` } as any
    setSolidFill(cellInv, PALE_YELLOW)
    cellInv.alignment = { horizontal: 'center', vertical: 'middle' }
    cellInv.numFmt = '#,##0;-#,##0;"-"'

    // 總收據 = 所有 doc=收據
    const foodCol = cols.find(c => c.statKey === 'food')?.index
    if (foodCol) {
      fillHeaderCell(ws.getRow(2).getCell(foodCol), '總收據', 'FFFCE4D6', BLACK)
      const cellRec = ws.getRow(2).getCell(foodCol + 1)
      cellRec.value = { formula: `SUMIFS(${totalRange},${docRow2Range},"收據")` } as any
      setSolidFill(cellRec, PALE_YELLOW)
      cellRec.alignment = { horizontal: 'center', vertical: 'middle' }
      cellRec.numFmt = '#,##0;-#,##0;"-"'
    }
  }

  // ── Row 3 : header（依 category 給不同底色，接近原檔） ──
  for (const c of cols) {
    let fill = HEADER_GRAY
    let fontColor = BLACK
    if (c.kind === 'income') {
      const k = c.incomeKey ?? ''
      fill = platformFillForColumn(c) ?? INCOME_HEADER_FILL
      if (k === 'actual' || k === 'ck') fontColor = RED_FONT
    } else if (c.kind === 'stat') {
      fill = c.statKey === 'total' ? BLACK : STAT_ORANGE_FILL
      if (c.statKey === 'pack') fill = STAT_BLUE_FILL
      if (c.statKey === 'misc') fill = STAT_MISC_FILL
      if (c.statKey === 'total') fontColor = WHITE
    } else if (c.kind === 'item') {
      if (c.isRefund || c.vendorGroup === '退稅') {
        fill = REFUND_DATA_FILL
        fontColor = RED_FONT
      } else if (c.category === '食材') fill = HEADER_GRAY
      else if (c.category === '耗材') fill = 'FFC6D9F0'
      else fill = 'FFF4B183'
    } else if (c.kind === 'date' || c.kind === 'weekday') {
      fill = HEADER_GRAY
    }
    fillHeaderCell(ws.getRow(HEADER_ROW).getCell(c.index), c.header, fill, fontColor, true)
  }

  // ── Row 4 : 月份標題 + 月合計 ──
  for (const c of cols) {
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    setGridBorder(cell)
    setSolidFill(cell, platformFillForColumn(c) ?? MONTH_TOTAL_YELLOW)
    cell.font = { name: FONT_FAMILY, size: 13, bold: true, italic: true, color: { argb: BLACK } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.numFmt = c.incomeKey === 'variance' ? RESULT_NUM_FMT : numFmtForColumn(c)
  }
  const monthCell = ws.getRow(TOTAL_ROW).getCell(1)
  monthCell.value = `${monthNum}月`
  monthCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(TOTAL_ROW).getCell(2).value = ''
  for (const c of cols) {
    if (c.kind === 'date' || c.kind === 'weekday' || c.kind === 'spacer') continue
    const letter = colLetter(c.index)
    const formula = `SUM(${letter}${DATA_START}:${letter}${DATA_START + daysInMonth - 1})`
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    cell.value = { formula } as any
    if (c.incomeKey === 'variance') cell.font = { ...(cell.font as any), color: { argb: BLACK }, bold: true, italic: true }
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
    const isClosedRow = dow === 0
    const excelRow = ws.getRow(rowNum)

    for (const c of cols) {
      const cell = excelRow.getCell(c.index)
      setGridBorder(cell)
      const fill = isClosedRow ? WEEKEND_GRAY : dataFillForColumn(c)
      if (fill) setSolidFill(cell, fill)
      // Data row 統一字體大小
      if (c.kind !== 'spacer') {
        cell.font = { name: FONT_FAMILY, size: DATA_DEFAULT_SIZE,
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
      } else if (c.kind === 'spacer') {
        cell.value = ''
      } else if (c.kind === 'income' && dd && c.incomeKey) {
        const platformSum = sumRefs(platformIncomeCols, rowNum)
        // 「結果」欄特殊：=0 顯示 0（不是空）、有誤差顯示紅色
        if (c.incomeKey === 'after_deduct' && posCol && statTotalCol) {
          cell.value = { formula: `${cellRef(posCol, rowNum)}-${cellRef(statTotalCol, rowNum)}-${platformSum}` } as any
          cell.numFmt = ZERO_NUM_FMT
        } else if (c.incomeKey === 'onsite' && posCol) {
          cell.value = { formula: `${cellRef(posCol, rowNum)}-${platformSum}` } as any
          cell.numFmt = ZERO_NUM_FMT
        } else if (c.incomeKey === 'variance' && actualCol && afterDeductCol && ckCol) {
          cell.value = { formula: `${cellRef(actualCol, rowNum)}-${cellRef(afterDeductCol, rowNum)}-${cellRef(ckCol, rowNum)}` } as any
          cell.numFmt = RESULT_NUM_FMT
          cell.font = { ...(cell.font as any), color: { argb: BLACK }, bold: true }
        } else if (c.incomeKey === 'revenue' && posCol && varianceCol) {
          cell.value = { formula: `IF(${cellRef(posCol, rowNum)}-${platformSum}>0,${cellRef(varianceCol, rowNum)}+${cellRef(posCol, rowNum)}-${platformSum},"")` } as any
          cell.numFmt = ZERO_NUM_FMT
          cell.font = { ...(cell.font as any), color: { argb: BLACK }, bold: true }
        } else {
          const v = readIncomeValue(dd, c.incomeKey, store)
          cell.value = v
          cell.numFmt = ZERO_NUM_FMT
        }
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
        cell.numFmt = ZERO_NUM_FMT
      } else if (c.kind === 'item' && dd) {
        // nameKey = 完整 item_name（aggregator items 用），header 可能剝過前綴
        // 先精確比對，再去掉連字號再比（處理「小雲-稅金」↔「小雲稅金」等改名差異）
        const key = c.nameKey ?? c.header
        const v = dd.items[key] ?? dd.items[key.replace(/-/g, '')] ?? 0
        cell.value = v
        const note = dd.notes[key] ?? dd.notes[key.replace(/-/g, '')]
        if (note?.trim()) cell.note = note
        cell.numFmt = numFmtForColumn(c)
        // 負數用紅色（折扣/退貨/退費類）
        if (v < 0) cell.font = { ...(cell.font as any), color: { argb: RED_FONT }, bold: true }
      }
    }
  }

  // 空白的 row 1/2 非品項區也補上舊表感底色與格線，避免左側上方看起來破碎。
  for (const rowNum of [1, 2]) {
    const row = ws.getRow(rowNum)
    for (const c of cols) {
      const cell = row.getCell(c.index)
      setGridBorder(cell)
      if (!cell.fill) setSolidFill(cell, c.kind === 'spacer' ? BLACK : PALE_YELLOW)
      if (!cell.font) cell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: BLACK } }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: c.kind !== 'spacer',
        shrinkToFit: false,
      }
    }
  }

  // 大區塊用粗黑線分隔，視覺上更接近原本手工維護的寬版 Excel。
  const incomeCols = cols.filter(c => c.kind === 'income')
  const statCols = cols.filter(c => c.kind === 'stat')
  const spacerCol = cols.find(c => c.kind === 'spacer')
  const majorLeftBorders = new Set<number>([
    1,
    incomeCols[0]?.index,
    spacerCol?.index,
    statCols[0]?.index,
    itemCols[0]?.index,
  ].filter(Boolean) as number[])
  const majorRightBorders = new Set<number>([
    2,
    incomeCols[incomeCols.length - 1]?.index,
    spacerCol?.index,
    statCols[statCols.length - 1]?.index,
    itemCols[itemCols.length - 1]?.index,
  ].filter(Boolean) as number[])
  for (const r of vgRanges) {
    majorLeftBorders.add(r.start)
    majorRightBorders.add(r.end)
  }
  for (let rowNum = 1; rowNum <= DATA_START + daysInMonth - 1; rowNum++) {
    for (const colIndex of majorLeftBorders) applyVerticalBorder(ws.getRow(rowNum).getCell(colIndex), 'left', 'medium')
    for (const colIndex of majorRightBorders) applyVerticalBorder(ws.getRow(rowNum).getCell(colIndex), 'right', 'medium')
  }

  // 營業額與差異欄維持醒目字重，方便掃描整月數字。
  for (let dayIdx = 0; dayIdx < daysInMonth; dayIdx++) {
    const rowNum = DATA_START + dayIdx
    const revenueCol = cols.find(c => c.incomeKey === 'revenue')?.index
    if (!revenueCol) continue
    const cell = ws.getRow(rowNum).getCell(revenueCol)
    if (typeof cell.value === 'number' && cell.value > 0) {
      setSolidFill(cell, PALE_YELLOW)
      cell.font = { ...(cell.font as any), bold: true }
    }
  }

  // ── 欄寬（依字體大小重新加寬避免字體被擋） ──
  for (const c of cols) {
    // 依 header 中文字數動態決定，但確保最小寬度
    const baseByKind = c.kind === 'date' ? 13 : c.kind === 'weekday' ? 11 : c.kind === 'income' ? 16 : c.kind === 'stat' ? 13 : c.kind === 'spacer' ? 13 : 12
    const headerLen = (c.header ?? '').length
    // 保留舊表的密度，但不要讓中文標題被壓成直排。
    const width = c.kind === 'spacer'
      ? 13
      : Math.min(24, Math.max(baseByKind, headerLen * 2.2 + 4))
    ws.getColumn(c.index).width = width
    // 取消 shrinkToFit（避免文字自動縮小）
    ws.getColumn(c.index).alignment = { ...(ws.getColumn(c.index).alignment as any), shrinkToFit: false, wrapText: true }
  }
  for (const rowNum of [1, 2]) {
    for (const c of cols) {
      if (c.kind !== 'spacer') continue
      const cell = ws.getRow(rowNum).getCell(c.index)
      if (cell.value) {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: false }
      }
    }
  }
  // ── Row 高度加大以容納較大字體 + 2 行 wrap ──
  ws.getRow(1).height = 38
  ws.getRow(2).height = 30
  ws.getRow(HEADER_ROW).height = 40
  ws.getRow(TOTAL_ROW).height = 30
  for (let i = 0; i < daysInMonth; i++) {
    ws.getRow(DATA_START + i).height = 22
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
  const ws = wb.addWorksheet('年度總覽', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }] })

  const TOTAL_COL = 14
  const monthHeaders = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  const headers = ['項目', ...monthHeaders, '全年合計']
  const headerByKey: Record<string, string> = {
    pos: '(手動)POS',
    twpay: 'TWPAY',
    panda: '熊貓',
    online: '線上',
    online_cash: '線上現金',
    after_deduct: '扣除後的$',
    onsite: '現場',
    actual: '(手動)實際$',
    ck: '配送(月底結)',
    variance: '結果',
    revenue: '營業額',
    total: '總',
    food: '食材',
    pack: '耗材',
    misc: '雜項',
  }

  const monthlyHeaderFormula = (sheetName: string, header: string) =>
    `IFERROR(INDEX('${sheetName}'!$4:$4,MATCH("${header}",'${sheetName}'!$3:$3,0)),0)`
  const monthlyDocFormula = (sheetName: string, doc: string) =>
    `SUMIFS('${sheetName}'!$4:$4,'${sheetName}'!$2:$2,"${doc}")`
  const monthlyRefundFormula = (sheetName: string) =>
    `IFERROR(INDEX('${sheetName}'!$1:$1,MATCH("梁平退稅",'${sheetName}'!$1:$1,0)+1),0)`
  const monthlyUberFormula = (sheetName: string) => {
    const accounts = store.uber_accounts ?? []
    if (accounts.length === 0) return '0'
    return `SUM(${accounts.map(acc => monthlyHeaderFormula(sheetName, acc)).join(',')})`
  }
  const monthlyHandwriteFormula = (sheetName: string) =>
    `SUMIF('${sheetName}'!$3:$3,"手寫*", '${sheetName}'!$4:$4)`
  const monthlyMetricFormula = (sheetName: string, key: keyof typeof headerByKey) =>
    monthlyHeaderFormula(sheetName, headerByKey[key])

  type OverviewRow = {
    label: string
    group: string
    formulaForMonth?: (month: number) => string
    totalFormula?: (rowNum: number) => string
    numFmt?: string
    highlight?: 'revenue' | 'cost' | 'receipt' | 'ratio' | 'profit'
  }
  type SectionRow = { section: string; fill: string }
  const revenueRows: OverviewRow[] = [
    { label: '(手動)POS', group: '通路收入', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'pos') },
    ...(store.twpay_enabled ? [{ label: 'TWPAY', group: '通路收入', formulaForMonth: (m: number) => monthlyMetricFormula(`${m}月食耗成本`, 'twpay') }] : []),
    ...((store.uber_accounts ?? []).length > 0 ? [{ label: 'Uber', group: '通路收入', formulaForMonth: (m: number) => monthlyUberFormula(`${m}月食耗成本`) }] : []),
    ...(store.panda_enabled ? [{ label: '熊貓', group: '通路收入', formulaForMonth: (m: number) => monthlyMetricFormula(`${m}月食耗成本`, 'panda') }] : []),
    ...(store.online_enabled ? [{ label: '線上', group: '通路收入', formulaForMonth: (m: number) => monthlyMetricFormula(`${m}月食耗成本`, 'online') }] : []),
    ...(store.online_cash_enabled ? [{ label: '線上現金', group: '通路收入', formulaForMonth: (m: number) => monthlyMetricFormula(`${m}月食耗成本`, 'online_cash') }] : []),
    { label: '手寫收入', group: '通路收入', formulaForMonth: m => monthlyHandwriteFormula(`${m}月食耗成本`) },
    { label: '營業額', group: '通路收入', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'revenue'), highlight: 'revenue' },
  ]
  const overviewRows: Array<SectionRow | OverviewRow> = [
    { section: '通路收入', fill: 'FFFFC000' },
    ...revenueRows,
    { section: '結算核對', fill: 'FFF4B183' },
    { label: '現場', group: '結算核對', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'onsite') },
    { label: '實際', group: '結算核對', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'actual') },
    { label: '配送(月底結)', group: '結算核對', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'ck') },
    { label: '扣除後的$', group: '結算核對', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'after_deduct') },
    { label: '結果', group: '結算核對', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'variance'), highlight: 'profit' },
    { section: '成本結構', fill: 'FF9BC2E6' },
    { label: '總成本（食+耗+雜）', group: '成本結構', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'total'), highlight: 'cost' },
    { label: '食材', group: '成本結構', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'food') },
    { label: '耗材', group: '成本結構', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'pack') },
    { label: '雜項', group: '成本結構', formulaForMonth: m => monthlyMetricFormula(`${m}月食耗成本`, 'misc') },
    { section: '單據 / 退稅', fill: 'FFD9EAD3' },
    { label: '總發票', group: '單據 / 退稅', formulaForMonth: m => monthlyDocFormula(`${m}月食耗成本`, '發票'), highlight: 'receipt' },
    { label: '總收據', group: '單據 / 退稅', formulaForMonth: m => monthlyDocFormula(`${m}月食耗成本`, '收據'), highlight: 'receipt' },
    { label: '估價單', group: '單據 / 退稅', formulaForMonth: m => monthlyDocFormula(`${m}月食耗成本`, '估價單'), highlight: 'receipt' },
    { label: '公司開', group: '單據 / 退稅', formulaForMonth: m => monthlyDocFormula(`${m}月食耗成本`, '公司開'), highlight: 'receipt' },
    { label: '梁平退稅', group: '單據 / 退稅', formulaForMonth: m => monthlyRefundFormula(`${m}月食耗成本`), highlight: 'receipt' },
  ]

  fillHeaderCell(ws.getRow(1).getCell(1), `${store.name}  ${year} 年度總覽`, 'FFFFF2CC', BLACK, true, 16)
  ws.mergeCells(1, 1, 1, TOTAL_COL)
  ws.getRow(1).height = 32

  headers.forEach((h, i) => fillHeaderCell(ws.getRow(3).getCell(i + 1), h, HEADER_GRAY, BLACK, true, 14))
  ws.getRow(3).height = 34

  const rowByLabel = new Map<string, number>()
  let rowNum = 4
  for (const row of overviewRows) {
    if ('section' in row) {
      ws.mergeCells(rowNum, 1, rowNum, TOTAL_COL)
      const cell = ws.getRow(rowNum).getCell(1)
      fillHeaderCell(cell, row.section, row.fill, BLACK, true, 13)
      ws.getRow(rowNum).height = 24
      rowNum++
      continue
    }
    rowByLabel.set(row.label, rowNum)
    const labelCell = ws.getRow(rowNum).getCell(1)
    fillHeaderCell(labelCell, row.label, 'FFFAFAFA', BLACK, true, 12)
    labelCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

    for (let m = 1; m <= 12; m++) {
      const cell = ws.getRow(rowNum).getCell(m + 1)
      setGridBorder(cell)
      setSolidFill(cell, row.highlight === 'revenue' ? 'FFE2F0D9' : row.highlight === 'cost' ? 'FFFCE4D6' : row.highlight === 'receipt' ? 'FFD9EAD3' : WHITE)
      cell.value = { formula: row.formulaForMonth?.(m) ?? '0' } as any
      cell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
      cell.font = { name: FONT_FAMILY, size: 12, bold: !!row.highlight }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
    const totalCell = ws.getRow(rowNum).getCell(TOTAL_COL)
    setGridBorder(totalCell)
    setSolidFill(totalCell, 'FFFFF2CC')
    totalCell.value = { formula: row.totalFormula?.(rowNum) ?? `SUM(B${rowNum}:M${rowNum})` } as any
    totalCell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
    totalCell.font = { name: FONT_FAMILY, size: 12, bold: true }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.getRow(rowNum).height = 24
    rowNum++
  }

  const revenueRow = rowByLabel.get('營業額')
  const costRow = rowByLabel.get('總成本（食+耗+雜）')
  const actualRow = rowByLabel.get('實際')
  const ckRow = rowByLabel.get('配送(月底結)')
  const resultRow = rowByLabel.get('結果')
  const ratioStart = rowNum + 1
  const ratioRows: OverviewRow[] = [
    {
      label: '成本率',
      group: '效率指標',
      formulaForMonth: m => revenueRow && costRow ? `IFERROR(${colLetter(m + 1)}${costRow}/${colLetter(m + 1)}${revenueRow},0)` : '0',
      totalFormula: () => revenueRow && costRow ? `IFERROR(N${costRow}/N${revenueRow},0)` : '0',
      numFmt: '0.0%',
      highlight: 'ratio',
    },
    {
      label: '配送占營業額',
      group: '效率指標',
      formulaForMonth: m => revenueRow && ckRow ? `IFERROR(${colLetter(m + 1)}${ckRow}/${colLetter(m + 1)}${revenueRow},0)` : '0',
      totalFormula: () => revenueRow && ckRow ? `IFERROR(N${ckRow}/N${revenueRow},0)` : '0',
      numFmt: '0.0%',
      highlight: 'ratio',
    },
    {
      label: '實際差額',
      group: '效率指標',
      formulaForMonth: m => actualRow && revenueRow ? `${colLetter(m + 1)}${actualRow}-${colLetter(m + 1)}${revenueRow}` : '0',
      totalFormula: () => actualRow && revenueRow ? `N${actualRow}-N${revenueRow}` : '0',
      highlight: 'profit',
    },
    {
      label: '結算結果',
      group: '效率指標',
      formulaForMonth: m => resultRow ? `${colLetter(m + 1)}${resultRow}` : '0',
      totalFormula: () => resultRow ? `N${resultRow}` : '0',
      highlight: 'profit',
    },
  ]

  ws.mergeCells(rowNum, 1, rowNum, TOTAL_COL)
  fillHeaderCell(ws.getRow(rowNum).getCell(1), '效率指標', 'FFB4C6E7', BLACK, true, 13)
  ws.getRow(rowNum).height = 24
  rowNum++
  for (const row of ratioRows) {
    const labelCell = ws.getRow(rowNum).getCell(1)
    fillHeaderCell(labelCell, row.label, 'FFFAFAFA', BLACK, true, 12)
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' }
    for (let m = 1; m <= 12; m++) {
      const cell = ws.getRow(rowNum).getCell(m + 1)
      setGridBorder(cell)
      setSolidFill(cell, 'FFEAF2F8')
      cell.value = { formula: row.formulaForMonth?.(m) ?? '0' } as any
      cell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
      cell.font = { name: FONT_FAMILY, size: 12, bold: true }
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
    const totalCell = ws.getRow(rowNum).getCell(TOTAL_COL)
    setGridBorder(totalCell)
    setSolidFill(totalCell, 'FFFFF2CC')
    totalCell.value = { formula: row.totalFormula?.(rowNum) ?? `SUM(B${rowNum}:M${rowNum})` } as any
    totalCell.numFmt = row.numFmt ?? '#,##0;-#,##0;"-"'
    totalCell.font = { name: FONT_FAMILY, size: 12, bold: true }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.getRow(rowNum).height = 24
    rowNum++
  }

  for (let r = 1; r < rowNum; r++) {
    applyVerticalBorder(ws.getRow(r).getCell(1), 'left', 'medium')
    applyVerticalBorder(ws.getRow(r).getCell(TOTAL_COL), 'right', 'medium')
  }
  for (let c = 1; c <= TOTAL_COL; c++) {
    applyVerticalBorder(ws.getRow(3).getCell(c), 'left', c === 1 ? 'medium' : 'medium')
    setGridBorder(ws.getRow(2).getCell(c))
    setSolidFill(ws.getRow(2).getCell(c), PALE_YELLOW)
  }

  ws.getColumn(1).width = 24
  for (let c = 2; c <= 13; c++) ws.getColumn(c).width = 13
  ws.getColumn(TOTAL_COL).width = 15
  for (let r = ratioStart; r < rowNum; r++) {
    const labelCell = ws.getRow(r).getCell(1)
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } }
  }
}

function readIncomeValue(dd: DailyStats, key: string, store?: StoreInfo): number {
  switch (key) {
    case 'pos': return getDisplayPosTotal(dd, store)
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
