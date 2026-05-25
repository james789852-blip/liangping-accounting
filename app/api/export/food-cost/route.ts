import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const C = {
  FFFFCC: 'FFFFFFCC',
  FFFF00: 'FFFFFF00',
  BFBFBF: 'FFBFBFBF',
  FFC000: 'FFFFC000',
  DA9694: 'FFDA9694',
  GREEN:  'FF00B050',
  C6D9F0: 'FFC6D9F0',
  FBD4B4: 'FFFBD4B4',
  FDE9D9: 'FFFDE9D9',
  F79544: 'FFF79544',
  WHITE:  'FFFFFFFF',
  NONE:   '',
}

function fill(cell: ExcelJS.Cell, argb: string) {
  if (!argb) return
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function font(cell: ExcelJS.Cell, bold = false, color = '00000000') {
  cell.font = { bold, size: 10, name: 'Calibri', color: { argb: color } }
}

function align(cell: ExcelJS.Cell, h: 'left' | 'center' | 'right' = 'center') {
  cell.alignment = { horizontal: h, vertical: 'middle' }
}

function thinBorder(cell: ExcelJS.Cell) {
  const s = { style: 'thin' as const, color: { argb: 'FFD0D0D0' } }
  cell.border = { top: s, bottom: s, left: s, right: s }
}

function getDaysInMonth(year: number, month: number) {
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const month   = searchParams.get('month')
  if (!storeId || !month) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

  const [yearStr, monthStr] = month.split('-')
  const year     = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay  = new Date(year, monthNum, 0).toISOString().slice(0, 10)

  const admin = createAdminClient()
  const [{ data: receipts }, { data: closings }, { data: storeRow }] = await Promise.all([
    admin.from('receipts')
      .select('business_date, receipt_items(excel_column, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('daily_closings')
      .select('business_date, total_revenue, actual_remit, variance, revenue_items(channel, gross_amount, account_name), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('stores').select('name, uber_accounts').eq('id', storeId).single(),
  ])

  const uberAccounts: string[] = storeRow?.uber_accounts ?? []
  const N = uberAccounts.length
  const foodCols = EXCEL_COLUMNS['食材']
  const packCols = EXCEL_COLUMNS['耗材']
  const miscCols = EXCEL_COLUMNS['雜項']

  // Column indices (0-based)
  const BASE = 4 + N  // column after uber accounts
  const COL_AFTER_DEDUCT = BASE
  const COL_ONSITE       = BASE + 1
  const COL_ACTUAL       = BASE + 2
  const COL_CK           = BASE + 3
  const COL_RESULT       = BASE + 4
  const COL_REVENUE      = BASE + 5
  const COL_SPACER       = BASE + 6
  const COL_TOTAL        = BASE + 7
  const COL_FOOD_SUB     = BASE + 8
  const COL_PACK_SUB     = BASE + 9
  const COL_MISC_SUB     = BASE + 10
  const COL_ITEMS_START  = BASE + 11
  const COL_FOOD_START   = COL_ITEMS_START
  const COL_PACK_START   = COL_FOOD_START + foodCols.length
  const COL_MISC_START   = COL_PACK_START + packCols.length
  const TOTAL_COLS       = COL_MISC_START + miscCols.length

  // Build per-date lookup
  interface DayData {
    items: Record<string, number>
    pos: number; twpay: number
    uber: Record<string, number>
    onsite: number; actual: number; ck: number
    revenue: number; variance: number
  }
  const byDate: Record<string, DayData> = {}
  function ensureDay(d: string): DayData {
    if (!byDate[d]) byDate[d] = { items: {}, pos: 0, twpay: 0, uber: {}, onsite: 0, actual: 0, ck: 0, revenue: 0, variance: 0 }
    return byDate[d]
  }

  for (const r of receipts ?? []) {
    const dd = ensureDay(r.business_date)
    for (const it of (r.receipt_items as any[]) ?? []) {
      if (it.excel_column) dd.items[it.excel_column] = (dd.items[it.excel_column] || 0) + (it.amount || 0)
    }
  }

  for (const c of closings ?? []) {
    const dd = ensureDay(c.business_date)
    dd.revenue  = c.total_revenue  ?? 0
    dd.actual   = c.actual_remit   ?? 0
    dd.variance = c.variance       ?? 0

    for (const rv of (c.revenue_items as any[]) ?? []) {
      if (rv.channel === 'pos')   dd.pos    += rv.gross_amount ?? 0
      if (rv.channel === 'twpay') dd.twpay  += rv.gross_amount ?? 0
      if (rv.channel === 'panda') dd.onsite += rv.gross_amount ?? 0
      if (rv.channel === 'uber' && rv.account_name) {
        dd.uber[rv.account_name] = (dd.uber[rv.account_name] || 0) + (rv.gross_amount ?? 0)
      }
    }
    dd.onsite += dd.pos + dd.twpay

    for (const oi of (c.order_items as any[]) ?? []) {
      if (oi.item_name === '央廚配送') dd.ck = oi.total_amount ?? 0
    }
  }

  // Excel helper: cell by [row, col] (both 0-based)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Liangping Accounting'
  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
  })

  function gc(r: number, c: number) { return ws.getRow(r).getCell(c + 1) }

  function styleHeader(r: number, c: number, value: string | number, fillColor: string, bold = true) {
    const cell = gc(r, c)
    cell.value = value
    fill(cell, fillColor)
    font(cell, bold)
    align(cell)
    thinBorder(cell)
  }

  function styleData(r: number, c: number, value: string | number | null, fillColor: string) {
    const cell = gc(r, c)
    if (value !== null && value !== 0) cell.value = value
    fill(cell, fillColor)
    font(cell, false)
    align(cell, 'center')
    thinBorder(cell)
  }

  // ─── ROW 1: Vendor group headers ───────────────────────────────────────────
  // Revenue section A..L: light yellow, no text
  for (let col = 0; col < COL_REVENUE + 1; col++) {
    styleHeader(1, col, '', C.FFFFCC, false)
  }
  // Spacer M
  gc(1, COL_SPACER).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }

  // Subtotal headers N..Q: gray
  for (let col = COL_TOTAL; col <= COL_MISC_SUB; col++) styleHeader(1, col, '', C.BFBFBF, false)

  // Vendor groups for food items
  const vendorGroups = [
    { name: '央廚配送', start: COL_FOOD_START,     end: COL_FOOD_START + 4,   color: C.NONE },
    { name: '振源',     start: COL_FOOD_START + 5, end: COL_FOOD_START + 5,   color: C.DA9694 },
    { name: '小雲',     start: COL_FOOD_START + 6, end: COL_FOOD_START + 6,   color: C.C6D9F0 },
    { name: '菜商',     start: COL_FOOD_START + 7, end: COL_FOOD_START + 14,  color: C.FDE9D9 },
    { name: '雜貨',     start: COL_FOOD_START + 15, end: COL_FOOD_START + 21, color: C.FBD4B4 },
    { name: '免洗',     start: COL_PACK_START,      end: COL_PACK_START + packCols.length - 1, color: C.C6D9F0 },
    { name: '感熱紙',   start: COL_MISC_START,      end: COL_MISC_START + 12, color: C.C6D9F0 },
    { name: '固定費用', start: COL_MISC_START + 13, end: COL_MISC_START + miscCols.length - 1, color: C.FBD4B4 },
  ]
  for (const g of vendorGroups) {
    styleHeader(1, g.start, g.name, g.color || C.WHITE, true)
    if (g.end > g.start) {
      ws.mergeCells(1, g.start + 1, 1, g.end + 1)
      for (let col = g.start + 1; col <= g.end; col++) {
        const cell = gc(1, col)
        fill(cell, g.color || C.WHITE)
        thinBorder(cell)
      }
    }
    const cell = gc(1, g.start)
    align(cell)
    font(cell, true)
  }

  // ─── ROW 2: Column headers (gray BFBFBF with some overrides) ───────────────
  const colHeaders: Array<{ label: string; color: string }> = [
    { label: '日期',    color: C.BFBFBF },
    { label: '星期',    color: C.BFBFBF },
    { label: 'POS',     color: C.FFC000 },
    { label: 'TWPAY',   color: C.DA9694 },
    ...uberAccounts.map(acc => ({ label: acc, color: C.GREEN })),
    { label: '扣除後的$', color: C.FFC000 },
    { label: '現場',    color: C.FFC000 },
    { label: '實際$',   color: C.FFC000 },
    { label: '配送(月底結)', color: C.FFFF00 },
    { label: '結果',    color: C.FFC000 },
    { label: '營業額',  color: C.FFC000 },
    { label: '',        color: C.NONE },  // spacer
    { label: '總',      color: C.BFBFBF },
    { label: '食材',    color: C.BFBFBF },
    { label: '耗材',    color: C.BFBFBF },
    { label: '雜項',    color: C.BFBFBF },
    ...foodCols.map(h => ({ label: h, color: C.BFBFBF })),
    ...packCols.map(h => ({ label: h, color: C.BFBFBF })),
    ...miscCols.map(h => ({ label: h, color: C.BFBFBF })),
  ]

  colHeaders.forEach(({ label, color }, ci) => {
    const cell = gc(2, ci)
    cell.value = label
    if (color) fill(cell, color)
    font(cell, true)
    align(cell)
    thinBorder(cell)
  })

  // Set column widths
  ws.columns = colHeaders.map((h, i) => ({
    width: i === 0 ? 12 : i === 1 ? 6 : h.label.length <= 2 ? 7 : Math.max(h.label.length * 1.8 + 2, 8),
  }))
  ws.getColumn(COL_SPACER + 1).width = 2

  // ─── ROW 3: Monthly totals ──────────────────────────────────────────────────
  const days = getDaysInMonth(year, monthNum)

  // We'll build daily data first to compute totals
  interface RowVals {
    pos: number; twpay: number; uber: Record<string, number>
    after_deduct: number; onsite: number; actual: number; ck: number
    result: number; revenue: number
    items: Record<string, number>
    foodTotal: number; packTotal: number; miscTotal: number; grandTotal: number
  }

  const dataRows: Array<{ date: string; row: RowVals }> = days.map(date => {
    const d = byDate[date]
    const pos     = d?.pos ?? 0
    const twpay   = d?.twpay ?? 0
    const uber    = d?.uber ?? {}
    const onsite  = d?.onsite ?? 0
    const actual  = d?.actual ?? 0
    const ck      = d?.ck ?? 0
    const revenue = d?.revenue ?? 0
    const variance = d?.variance ?? 0
    const uberTotal = uberAccounts.reduce((s, acc) => s + (uber[acc] ?? 0), 0)
    const after_deduct = uberTotal  // display uber subtotal
    const items = d?.items ?? {}
    const foodTotal = foodCols.reduce((s, col) => s + (items[col] || 0), 0)
    const packTotal = packCols.reduce((s, col) => s + (items[col] || 0), 0)
    const miscTotal = miscCols.reduce((s, col) => s + (items[col] || 0), 0)
    const grandTotal = foodTotal + packTotal + miscTotal
    return {
      date, row: {
        pos, twpay, uber, after_deduct, onsite, actual, ck, result: variance,
        revenue, items, foodTotal, packTotal, miscTotal, grandTotal,
      },
    }
  })

  // Monthly totals
  const sumOf = (fn: (r: RowVals) => number) => dataRows.reduce((s, { row }) => s + fn(row), 0)
  const totals: RowVals = {
    pos:          sumOf(r => r.pos),
    twpay:        sumOf(r => r.twpay),
    uber:         Object.fromEntries(uberAccounts.map(acc => [acc, dataRows.reduce((s, { row }) => s + (row.uber[acc] ?? 0), 0)])),
    after_deduct: sumOf(r => r.after_deduct),
    onsite:       sumOf(r => r.onsite),
    actual:       sumOf(r => r.actual),
    ck:           sumOf(r => r.ck),
    result:       sumOf(r => r.result),
    revenue:      sumOf(r => r.revenue),
    items:        Object.fromEntries([...foodCols, ...packCols, ...miscCols].map(col => [
      col, dataRows.reduce((s, { row }) => s + (row.items[col] || 0), 0),
    ])),
    foodTotal:    sumOf(r => r.foodTotal),
    packTotal:    sumOf(r => r.packTotal),
    miscTotal:    sumOf(r => r.miscTotal),
    grandTotal:   sumOf(r => r.grandTotal),
  }

  function writeRowData(excelRow: number, label: string | null, row: RowVals, fillA_L: string) {
    const dt = label === null
      ? null
      : new Date(label + 'T12:00:00+08:00')

    // A: date
    const cellA = gc(excelRow, 0)
    if (dt) { cellA.value = dt; cellA.numFmt = 'm/d' } else { cellA.value = `${monthNum}月合計` }
    fill(cellA, fillA_L); font(cellA, !dt); align(cellA); thinBorder(cellA)

    // B: weekday
    const cellB = gc(excelRow, 1)
    cellB.value = dt ? `星期${WEEKDAYS[dt.getDay()]}` : ''
    fill(cellB, fillA_L); font(cellB, false); align(cellB); thinBorder(cellB)

    const rvFill = fillA_L  // revenue section same fill as A:L
    const numOrBlank = (v: number) => v || null

    styleData(excelRow, 2, numOrBlank(row.pos),          rvFill)
    styleData(excelRow, 3, numOrBlank(row.twpay),         rvFill)
    for (let i = 0; i < N; i++) {
      styleData(excelRow, 4 + i, numOrBlank(row.uber[uberAccounts[i]] ?? 0), rvFill)
    }
    styleData(excelRow, COL_AFTER_DEDUCT, numOrBlank(row.after_deduct), rvFill)
    styleData(excelRow, COL_ONSITE,       numOrBlank(row.onsite),       rvFill)
    styleData(excelRow, COL_ACTUAL,       numOrBlank(row.actual),       rvFill)
    styleData(excelRow, COL_CK,           numOrBlank(row.ck),           rvFill)
    styleData(excelRow, COL_RESULT,       numOrBlank(row.result),       rvFill)
    styleData(excelRow, COL_REVENUE,      numOrBlank(row.revenue),      rvFill)

    // Spacer
    gc(excelRow, COL_SPACER).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }

    // Subtotals N:Q
    styleData(excelRow, COL_TOTAL,    numOrBlank(row.grandTotal), C.WHITE)
    styleData(excelRow, COL_FOOD_SUB, numOrBlank(row.foodTotal),  C.F79544)
    styleData(excelRow, COL_PACK_SUB, numOrBlank(row.packTotal),  C.C6D9F0)
    styleData(excelRow, COL_MISC_SUB, numOrBlank(row.miscTotal),  C.F79544)

    // Food items: white
    for (let i = 0; i < foodCols.length; i++) {
      styleData(excelRow, COL_FOOD_START + i, numOrBlank(row.items[foodCols[i]] || 0), C.WHITE)
    }
    // Pack items: light blue
    for (let i = 0; i < packCols.length; i++) {
      styleData(excelRow, COL_PACK_START + i, numOrBlank(row.items[packCols[i]] || 0), C.C6D9F0)
    }
    // Misc variable [0:13]: light blue
    for (let i = 0; i < 13; i++) {
      styleData(excelRow, COL_MISC_START + i, numOrBlank(row.items[miscCols[i]] || 0), C.C6D9F0)
    }
    // Misc fixed [13:]: peach
    for (let i = 13; i < miscCols.length; i++) {
      styleData(excelRow, COL_MISC_START + i, numOrBlank(row.items[miscCols[i]] || 0), C.FBD4B4)
    }
  }

  // Write monthly totals row (row 3)
  writeRowData(3, null, totals, C.FFFF00)

  // Write daily rows starting from row 4
  dataRows.forEach(({ date, row }, i) => {
    writeRowData(4 + i, date, row, C.FFFFCC)
  })

  // ─── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(1).height = 18
  ws.getRow(2).height = 20
  ws.getRow(3).height = 18
  for (let i = 0; i < days.length; i++) ws.getRow(4 + i).height = 16

  // ─── Output ─────────────────────────────────────────────────────────────────
  const storeName = storeRow?.name ?? 'export'
  const filename  = encodeURIComponent(`${storeName}_${year}${String(monthNum).padStart(2, '0')}_食耗成本.xlsx`)

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
