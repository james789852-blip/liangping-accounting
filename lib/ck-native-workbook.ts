/**
 * 央廚食耗成本 xlsx（系統原生產出，無模板依賴）
 *
 * Layout：
 *   Row 1: 收入區「訂單收入」+ 支出區「費用支出」
 *   Row 2: 收入子群（成員店家 / 外部店家）+ 支出子群（食材 / 耗材 / 雜項）
 *   Row 3: 欄位標題（日期 / 星期 / 狀態 + 各店名 / 外部店 + 各費用品項 + 合計欄）
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
  kind: 'date' | 'weekday' | 'status' | 'member' | 'external' | 'expense' | 'stat'
  category?: '食材' | '耗材' | '雜項'
  vendorGroup?: string
  docType?: string
  itemKey?: string
  statKey?: 'memberRevenue' | 'externalRevenue' | 'revenue' | 'food' | 'pack' | 'misc' | 'totalExpense' | 'balance'
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
const CK_VG_PALETTE = [
  'FFFDE9D9', 'FFDCEBF3', 'FFE2EFDA', 'FFFFF2CC',
  'FFF4CCCC', 'FFEAD1DC', 'FFC9DAF8', 'FFD9EAD3',
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

function fillHeader(cell: ExcelJS.Cell, text: string, fill?: string, bold = false, fontColor = 'FF000000', size = 13) {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
  cell.font = { name: CK_FONT, size, bold, color: { argb: fontColor } }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  }
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
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
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
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
  cols.push({ index: idx++, header: '狀態', kind: 'status' })

  // 成員店家收入欄
  for (const m of memberStores) {
    cols.push({ index: idx++, header: m.store_name, kind: 'member', itemKey: m.store_id })
  }
  // 外部店家收入欄
  for (const e of externalNames) {
    cols.push({ index: idx++, header: e.name, kind: 'external', itemKey: e.name })
  }

  // 收入小計欄
  cols.push({ index: idx++, header: '總收入', kind: 'stat', statKey: 'revenue' })

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

  // 支出小計 + 淨額
  cols.push({ index: idx++, header: '食材', kind: 'stat', statKey: 'food' })
  cols.push({ index: idx++, header: '耗材', kind: 'stat', statKey: 'pack' })
  cols.push({ index: idx++, header: '雜項', kind: 'stat', statKey: 'misc' })
  cols.push({ index: idx++, header: '總支出', kind: 'stat', statKey: 'totalExpense' })
  cols.push({ index: idx++, header: '淨額', kind: 'stat', statKey: 'balance' })

  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const HEADER_ROW = 3
  const TOTAL_ROW = 4
  const DATA_START = 5

  // Row 1 大群組 header
  const memberCols = cols.filter(c => c.kind === 'member')
  const externalCols = cols.filter(c => c.kind === 'external')
  const expenseCols = cols.filter(c => c.kind === 'expense')

  if (memberCols.length > 0 || externalCols.length > 0) {
    const revStart = (memberCols[0] ?? externalCols[0])!.index
    const revEnd = (externalCols[externalCols.length - 1] ?? memberCols[memberCols.length - 1])!.index
    fillHeader(ws.getRow(1).getCell(revStart), '訂單收入', 'FFD9EAD3', true)
    if (revEnd > revStart) ws.mergeCells(1, revStart, 1, revEnd)
  }
  if (memberCols.length > 0) {
    const s = memberCols[0].index, e = memberCols[memberCols.length - 1].index
    fillHeader(ws.getRow(2).getCell(s), '成員店家', 'FFEAF4E4', true)
    if (e > s) ws.mergeCells(2, s, 2, e)
  }
  if (externalCols.length > 0) {
    const s = externalCols[0].index, e = externalCols[externalCols.length - 1].index
    fillHeader(ws.getRow(2).getCell(s), '外部店家', 'FFEAF4E4', true)
    if (e > s) ws.mergeCells(2, s, 2, e)
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

  // 「梁平退稅 / 總發票 / 總收據」統計欄 — 放在總收入欄上方（Row 1 + Row 2）
  const revStatCol = cols.find(c => c.statKey === 'revenue')?.index
  if (revStatCol && expenseCols.length > 0) {
    const eS = colLetter(expenseCols[0].index)
    const eE = colLetter(expenseCols[expenseCols.length - 1].index)
    const totalRange = `${eS}${TOTAL_ROW}:${eE}${TOTAL_ROW}`
    const docRow2 = `${eS}2:${eE}2`
    const vgRow1 = `${eS}1:${eE}1`

    // 梁平退稅
    fillHeader(ws.getRow(1).getCell(revStatCol - 1), '梁平退稅', 'FFC6EFCE', true)
    const refundCell = ws.getRow(1).getCell(revStatCol)
    refundCell.value = { formula: `SUMIFS(${totalRange},${docRow2},"發票",${vgRow1},"退稅")` } as any
    refundCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
    refundCell.alignment = { horizontal: 'center', vertical: 'middle' }
    refundCell.font = { name: 'Calibri', size: 10, bold: true }
    refundCell.numFmt = '#,##0;-#,##0;"-"'

    // 總發票
    fillHeader(ws.getRow(2).getCell(revStatCol - 1), '總發票', 'FFC6D9F0', true)
    const invCell = ws.getRow(2).getCell(revStatCol)
    invCell.value = { formula: `SUMIFS(${totalRange},${docRow2},"發票")` } as any
    invCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } }
    invCell.alignment = { horizontal: 'center', vertical: 'middle' }
    invCell.numFmt = '#,##0;-#,##0;"-"'
  }

  // Row 3 header
  for (const c of cols) {
    let fill = 'FFEEEEEE'
    if (c.kind === 'member' || c.kind === 'external') fill = 'FFEAF4E4'
    else if (c.kind === 'expense') {
      fill = c.category === '食材' ? 'FFFCE4D6' : c.category === '耗材' ? 'FFC6D9F0' : 'FFDDD9C4'
    }
    else if (c.kind === 'stat') fill = c.statKey === 'balance' ? 'FFFFFF00' : 'FFF79544'
    else if (c.kind === 'date' || c.kind === 'weekday' || c.kind === 'status') fill = 'FFBFBFBF'
    fillHeader(ws.getRow(HEADER_ROW).getCell(c.index), c.header, fill, true)
  }

  // Row 4 月合計
  fillHeader(ws.getRow(TOTAL_ROW).getCell(1), `${monthNum}月`, 'FFFFFF00', true)
  const memberColStart = memberCols[0]?.index
  const memberColEnd = memberCols[memberCols.length - 1]?.index
  const extColStart = externalCols[0]?.index
  const extColEnd = externalCols[externalCols.length - 1]?.index
  const foodExpCols = expenseCols.filter(c => c.category === '食材')
  const packExpCols = expenseCols.filter(c => c.category === '耗材')
  const miscExpCols = expenseCols.filter(c => c.category === '雜項')

  for (const c of cols) {
    if (c.kind === 'date' || c.kind === 'weekday' || c.kind === 'status') continue
    const letter = colLetter(c.index)
    const cell = ws.getRow(TOTAL_ROW).getCell(c.index)
    let formula: string
    if (c.kind === 'stat' && c.statKey === 'revenue') {
      // 總收入 = 成員店家 range 加總 + 外部店家 range 加總
      const parts: string[] = []
      if (memberColStart && memberColEnd) parts.push(`SUM(${colLetter(memberColStart)}${TOTAL_ROW}:${colLetter(memberColEnd)}${TOTAL_ROW})`)
      if (extColStart && extColEnd) parts.push(`SUM(${colLetter(extColStart)}${TOTAL_ROW}:${colLetter(extColEnd)}${TOTAL_ROW})`)
      formula = parts.length > 0 ? parts.join('+') : '0'
    } else if (c.kind === 'stat' && c.statKey === 'food' && foodExpCols.length > 0) {
      formula = `SUM(${colLetter(foodExpCols[0].index)}${TOTAL_ROW}:${colLetter(foodExpCols[foodExpCols.length-1].index)}${TOTAL_ROW})`
    } else if (c.kind === 'stat' && c.statKey === 'pack' && packExpCols.length > 0) {
      formula = `SUM(${colLetter(packExpCols[0].index)}${TOTAL_ROW}:${colLetter(packExpCols[packExpCols.length-1].index)}${TOTAL_ROW})`
    } else if (c.kind === 'stat' && c.statKey === 'misc' && miscExpCols.length > 0) {
      formula = `SUM(${colLetter(miscExpCols[0].index)}${TOTAL_ROW}:${colLetter(miscExpCols[miscExpCols.length-1].index)}${TOTAL_ROW})`
    } else if (c.kind === 'stat' && c.statKey === 'totalExpense') {
      const foodCol = cols.find(x => x.statKey === 'food')
      const packCol = cols.find(x => x.statKey === 'pack')
      const miscCol = cols.find(x => x.statKey === 'misc')
      formula = `${colLetter(foodCol!.index)}${TOTAL_ROW}+${colLetter(packCol!.index)}${TOTAL_ROW}+${colLetter(miscCol!.index)}${TOTAL_ROW}`
    } else if (c.kind === 'stat' && c.statKey === 'balance') {
      const revCol = cols.find(x => x.statKey === 'revenue')
      const totalExpCol = cols.find(x => x.statKey === 'totalExpense')
      formula = `${colLetter(revCol!.index)}${TOTAL_ROW}-${colLetter(totalExpCol!.index)}${TOTAL_ROW}`
    } else {
      formula = `SUM(${letter}${DATA_START}:${letter}${DATA_START + daysInMonth - 1})`
    }
    cell.value = { formula } as any
    cell.font = { name: 'Calibri', size: 10, bold: true, italic: true }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    cell.numFmt = '#,##0;-#,##0;"-"'
    if (c.kind === 'stat') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.statKey === 'balance' ? 'FFFFFF00' : 'FFFDE9D9' } }
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
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (isWeekend) cell.font = { color: { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }, bold: true }
      } else if (c.kind === 'weekday') {
        cell.value = `星期${WEEKDAYS[dow]}`
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (isWeekend) cell.font = { color: { argb: dow === 0 ? 'FFDC2626' : 'FF0369A1' }, bold: true }
      } else if (c.kind === 'status' && dd) {
        cell.value = dd.status === 'submitted' ? '已送' : dd.status === 'draft' ? '草稿' : ''
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if (c.kind === 'member' && dd) {
        const v = dd.memberOrders.find(o => o.store_id === c.itemKey)?.amount ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'external' && dd) {
        const v = dd.externalOrders.find(o => o.name === c.itemKey)?.amount ?? 0
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'expense' && dd) {
        const [cat, name] = (c.itemKey ?? '').split('||')
        const v = dd.expenses.filter(e => e.category === cat && e.item_name === name).reduce((s, e) => s + e.amount, 0)
        if (v !== 0) cell.value = v
        cell.numFmt = '#,##0;-#,##0;'
      } else if (c.kind === 'stat' && c.statKey) {
        // 每日小計用 SUM range 公式
        const letter = colLetter(c.index)
        let formula: string | null = null
        if (c.statKey === 'revenue') {
          const parts: string[] = []
          if (memberColStart && memberColEnd) parts.push(`SUM(${colLetter(memberColStart)}${rowNum}:${colLetter(memberColEnd)}${rowNum})`)
          if (extColStart && extColEnd) parts.push(`SUM(${colLetter(extColStart)}${rowNum}:${colLetter(extColEnd)}${rowNum})`)
          if (parts.length > 0) formula = parts.join('+')
        } else if (c.statKey === 'food' && foodExpCols.length > 0) {
          formula = `SUM(${colLetter(foodExpCols[0].index)}${rowNum}:${colLetter(foodExpCols[foodExpCols.length-1].index)}${rowNum})`
        } else if (c.statKey === 'pack' && packExpCols.length > 0) {
          formula = `SUM(${colLetter(packExpCols[0].index)}${rowNum}:${colLetter(packExpCols[packExpCols.length-1].index)}${rowNum})`
        } else if (c.statKey === 'misc' && miscExpCols.length > 0) {
          formula = `SUM(${colLetter(miscExpCols[0].index)}${rowNum}:${colLetter(miscExpCols[miscExpCols.length-1].index)}${rowNum})`
        } else if (c.statKey === 'totalExpense') {
          const foodCol = cols.find(x => x.statKey === 'food')
          const packCol = cols.find(x => x.statKey === 'pack')
          const miscCol = cols.find(x => x.statKey === 'misc')
          if (foodCol && packCol && miscCol) formula = `${colLetter(foodCol.index)}${rowNum}+${colLetter(packCol.index)}${rowNum}+${colLetter(miscCol.index)}${rowNum}`
        } else if (c.statKey === 'balance') {
          const revCol = cols.find(x => x.statKey === 'revenue')
          const totalExpCol = cols.find(x => x.statKey === 'totalExpense')
          if (revCol && totalExpCol) formula = `${colLetter(revCol.index)}${rowNum}-${colLetter(totalExpCol.index)}${rowNum}`
        }
        if (formula) cell.value = { formula } as any
        cell.numFmt = '#,##0;-#,##0;'
      }
    }
  }

  // 欄寬（依 header 中文字數動態拉寬，避免字體被壓縮）
  for (const c of cols) {
    const base = c.kind === 'date' ? 12 : c.kind === 'weekday' ? 10 : c.kind === 'status' ? 10 : 14
    const headerLen = (c.header ?? '').length
    const w = Math.max(base, headerLen * 2 + 2)
    ws.getColumn(c.index).width = w
    ws.getColumn(c.index).alignment = { ...(ws.getColumn(c.index).alignment as any), shrinkToFit: false, wrapText: true }
  }
  // Row 高度（與店面 xlsx 一致）
  ws.getRow(1).height = 38
  ws.getRow(2).height = 30
  ws.getRow(3).height = 40
  ws.getRow(4).height = 30
  for (let i = 1; i <= daysInMonth; i++) ws.getRow(DATA_START + i - 1).height = 22
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
  const ws = wb.addWorksheet('年度總覽', { views: [{ state: 'frozen', ySplit: 3 }] })

  fillHeader(ws.getRow(1).getCell(1), `央廚 ${year} 年度總覽`, 'FFFFF2CC', true)
  ws.mergeCells(1, 1, 1, 14)

  const headers = ['項目', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '全年合計']
  headers.forEach((h, i) => fillHeader(ws.getRow(3).getCell(i + 1), h, 'FFBFBFBF', true))

  const rows: Array<{ label: string; sheetHeader: string }> = [
    { label: '總收入', sheetHeader: '總收入' },
    { label: '食材',   sheetHeader: '食材' },
    { label: '耗材',   sheetHeader: '耗材' },
    { label: '雜項',   sheetHeader: '雜項' },
    { label: '總支出', sheetHeader: '總支出' },
    { label: '淨額',   sheetHeader: '淨額' },
  ]

  rows.forEach((row, rIdx) => {
    const excelRow = 4 + rIdx
    fillHeader(ws.getRow(excelRow).getCell(1), row.label, 'FFFAFAFA', true)
    for (let m = 1; m <= 12; m++) {
      const cell = ws.getRow(excelRow).getCell(m + 1)
      const sheetName = `${m}月央廚食耗`
      // 用 INDEX+MATCH 從月份 sheet 的 Row 3 header + Row 4 月合計抓對應數字
      const formula = `IFERROR(INDEX('${sheetName}'!$4:$4,MATCH("${row.sheetHeader}",'${sheetName}'!$3:$3,0)),0)`
      cell.value = { formula } as any
      cell.numFmt = '#,##0;-#,##0;"-"'
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    }
    const totalCell = ws.getRow(excelRow).getCell(14)
    totalCell.value = { formula: `SUM(B${excelRow}:M${excelRow})` } as any
    totalCell.numFmt = '#,##0;-#,##0;"-"'
    totalCell.font = { bold: true }
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' }
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  })

  ws.getColumn(1).width = 18
  for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 12
}
