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

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

interface ColumnDef {
  index: number
  header: string
  kind: 'date' | 'weekday' | 'status' | 'member' | 'external' | 'expense' | 'stat'
  category?: '食材' | '耗材' | '雜項'
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

function fillHeader(cell: ExcelJS.Cell, text: string, fill?: string, bold = false, fontColor = 'FF000000') {
  cell.value = text
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.font = { name: 'Calibri', size: 10, bold, color: { argb: fontColor } }
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
  const monthly = await getCKMonthlyStats(ckStoreId, year, monthNum)

  const ws = wb.addWorksheet(`${monthNum}月央廚食耗`, {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
  })

  // 動態欄：成員店家 / 外部店家 / 支出品項（依當月出現過的）
  const memberStores = monthly.memberByStore
  const externalNames = monthly.externalByName
  const expenseItems = monthly.expenseByItem  // 已依 total desc 排序

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

  // 支出品項欄（依 category 排序：食→耗→雜）
  const catOrder: Record<string, number> = { '食材': 0, '耗材': 1, '雜項': 2 }
  const sortedExpenseItems = [...expenseItems].sort((a, b) =>
    (catOrder[a.category] ?? 3) - (catOrder[b.category] ?? 3)
    || b.total - a.total
  )
  for (const e of sortedExpenseItems) {
    cols.push({ index: idx++, header: e.item_name, kind: 'expense', category: e.category as any, itemKey: `${e.category}||${e.item_name}` })
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
    const s = expenseCols[0].index, e = expenseCols[expenseCols.length - 1].index
    fillHeader(ws.getRow(1).getCell(s), '費用支出', 'FFFDE9D9', true)
    if (e > s) ws.mergeCells(1, s, 1, e)
    // Row 2 依 category 分區
    let curCat = expenseCols[0].category
    let curStart = expenseCols[0].index
    for (const c of expenseCols) {
      if (c.category !== curCat) {
        const prevEnd = c.index - 1
        fillHeader(ws.getRow(2).getCell(curStart), curCat!, 'FFFCE4D6', true)
        if (prevEnd > curStart) ws.mergeCells(2, curStart, 2, prevEnd)
        curCat = c.category
        curStart = c.index
      }
    }
    // 最後一段
    const lastEnd = expenseCols[expenseCols.length - 1].index
    fillHeader(ws.getRow(2).getCell(curStart), curCat!, 'FFFCE4D6', true)
    if (lastEnd > curStart) ws.mergeCells(2, curStart, 2, lastEnd)
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

  // 欄寬
  for (const c of cols) {
    const w = c.kind === 'date' ? 10 : c.kind === 'weekday' ? 8 : c.kind === 'status' ? 8 : 12
    ws.getColumn(c.index).width = w
  }
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
