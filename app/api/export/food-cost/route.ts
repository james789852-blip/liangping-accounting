import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { type RowVals, norm, fillWorksheet, buildGroupByMerge } from '@/lib/food-cost-template'
import { getMonthLastDay } from '@/lib/business-date'

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

async function fillTemplate(
  templateBuf: Buffer,
  monthNum: number,
  year: number,
  days: string[],
  dataRows: Array<{ date: string; row: RowVals }>,
  storeName: string,
  uberAccounts: string[],
  vendorGroupLookup?: Record<string, string>,
): Promise<NextResponse | null> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(templateBuf as any)
  } catch (e) { console.warn('[fillTemplate] 載入模板失敗:', e); return null }

  const targetName = `${monthNum}月食耗成本`
  const ws = wb.getWorksheet(targetName)
    ?? wb.getWorksheet(`${monthNum}月`)
    ?? wb.worksheets.find(s => s.name.includes('食耗'))
    ?? wb.worksheets[0]
  if (!ws) { console.warn(`[fillTemplate] 找不到任何工作表`); return null }
  if (ws.name !== targetName) {
    console.warn(`[fillTemplate] 未找到「${targetName}」，改用工作表「${ws.name}」。模板所有工作表：`, wb.worksheets.map(s => s.name))
  }

  const filled = await fillWorksheet(ws, days, dataRows, uberAccounts, vendorGroupLookup)
  if (!filled) { console.warn('[fillTemplate] fillWorksheet returned null'); return null }

  const filename = encodeURIComponent(`${storeName}_${year}${String(monthNum).padStart(2, '0')}_食耗成本.xlsx`)
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
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
  const lastDay  = getMonthLastDay(year, monthNum)

  const admin = createAdminClient()
  const [{ data: receipts }, { data: closings }, { data: storeRow }, { data: mappingsRaw }, { data: ckPricesData }] = await Promise.all([
    admin.from('receipts')
      .select('business_date, total_amount, tax_amount, receipt_type, notes, receipt_items(item_name, excel_column, amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('daily_closings')
      .select('business_date, total_revenue, actual_remit, variance, revenue_items(channel, gross_amount, account_name), order_items(item_name, total_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('stores').select('name, uber_accounts, ichef_uber_linked').eq('id', storeId).single(),
    admin.from('item_column_mappings')
      .select('item_name, excel_column, item_category, vendor_group, store_id')
      .or(`store_id.is.null,store_id.eq.${storeId}`),
    admin.from('central_kitchen_prices').select('item_name, excel_column').eq('active', true),
  ])
  const mappingLookup: Record<string, string> = {}
  const categoryLookup: Record<string, string> = {}
  const vendorGroupLookup: Record<string, string> = {}
  // Global first, then store-specific overrides
  for (const m of (mappingsRaw ?? []).filter((m: any) => !m.store_id)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
    if (m.vendor_group) { vendorGroupLookup[m.item_name] = m.vendor_group; vendorGroupLookup[m.excel_column] = m.vendor_group }
  }
  for (const m of (mappingsRaw ?? []).filter((m: any) => m.store_id === storeId)) {
    mappingLookup[m.item_name] = m.excel_column
    categoryLookup[m.item_name] = m.item_category
    if (m.vendor_group) { vendorGroupLookup[m.item_name] = m.vendor_group; vendorGroupLookup[m.excel_column] = m.vendor_group }
  }

  // 模板只下載一次（vg fallback + fillTemplate 共用），避免 storage roundtrip 兩次
  let templateBuffer: Buffer | null = null
  try {
    const { data: tmpl } = await admin.storage.from('excel-templates').download(`${storeId}.xlsx`)
    if (tmpl) templateBuffer = Buffer.from(await tmpl.arrayBuffer())
  } catch (e) {
    console.warn('[food-cost] template download failed:', e)
  }

  // Runtime fallback：從模板 row 1/2 群組標籤補齊 DB 內 vendor_group 為 null 的 mapping
  if (templateBuffer) {
    try {
      const tmpWB = new ExcelJS.Workbook()
      await tmpWB.xlsx.load(templateBuffer as any)
      const ws = tmpWB.getWorksheet(`${monthNum}月食耗成本`)
        ?? tmpWB.worksheets.find(s => s.name.includes('食耗'))
        ?? tmpWB.worksheets[0]
      if (ws) {
        let headerRowNum = -1
        for (let r = 1; r <= 10; r++) {
          if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
        }
        if (headerRowNum >= 3) {
          const groupOfCol = buildGroupByMerge(ws, headerRowNum - 2, headerRowNum - 1)
          ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
            const headerName = cell.text?.trim()
            if (!headerName) return
            const vg = groupOfCol[colNum]
            if (!vg || vg === '未分類' || vg === '央廚配送' || vg === '退稅' || vg === '稅金') return
            if (!vendorGroupLookup[headerName]) {
              vendorGroupLookup[headerName] = vg
            }
          })
        }
      }
    } catch (e) {
      console.warn('[food-cost vg-fallback] failed:', e)
    }
  }

  // CK item name → excel column (fallback to item_name itself)
  const ckColLookup: Record<string, string> = {}
  for (const p of (ckPricesData ?? []) as any[]) {
    ckColLookup[p.item_name] = p.excel_column || p.item_name
  }

  const uberAccounts: string[] = storeRow?.uber_accounts ?? []
  const ichefLinked: boolean = storeRow?.ichef_uber_linked ?? false
  const N = uberAccounts.length

  // Load store-specific columns if available, fallback to defaults
  let storeColumns = EXCEL_COLUMNS
  try {
    const { data: colFile } = await admin.storage.from('excel-templates').download(`${storeId}-columns.json`)
    if (colFile) {
      const parsed = JSON.parse(await colFile.text())
      if (parsed['食材']?.length && parsed['耗材']?.length && parsed['雜項']?.length) {
        storeColumns = parsed
      }
    }
  } catch { /* fallback to defaults */ }

  const foodCols = storeColumns['食材']
  const packCols = storeColumns['耗材']
  const miscCols = storeColumns['雜項']

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
    notes: Record<string, string>
    pos: number; twpay: number
    panda: number; online: number; online_cash: number
    uber: Record<string, number>
    onsite: number; actual: number; ck: number
    revenue: number; variance: number
  }
  const byDate: Record<string, DayData> = {}
  function ensureDay(d: string): DayData {
    if (!byDate[d]) byDate[d] = { items: {}, notes: {}, pos: 0, twpay: 0, panda: 0, online: 0, online_cash: 0, uber: {}, onsite: 0, actual: 0, ck: 0, revenue: 0, variance: 0 }
    return byDate[d]
  }

  let invoiceTotal = 0, receiptTotal = 0
  for (const r of (receipts ?? []) as any[]) {
    const dd = ensureDay(r.business_date)
    const resolvedItems = (r.receipt_items ?? []).map((it: any) => ({
      ...it,
      resolved_col: mappingLookup[it.item_name] ?? it.excel_column ?? '',
    }))
    // Include all non-zero items (negatives = discounts must be written too)
    const validItems = resolvedItems.filter((it: any) => it.resolved_col && it.amount)
    // Positive-only subset for tax routing & proportional distribution
    const positiveItems = validItems.filter((it: any) => (it.amount as number) > 0)
    const itemsSum = positiveItems.reduce((s: number, it: any) => s + (it.amount as number), 0)
    // Write ALL valid items including negative discounts
    for (const it of validItems) {
      const vg = vendorGroupLookup[it.item_name]
      const key = (vg && it.item_name !== it.resolved_col)
        ? `_col_${vg}_${it.resolved_col}`
        : it.resolved_col
      dd.items[key] = (dd.items[key] || 0) + (it.amount as number)
    }
    // Attach receipt notes to affected columns
    if ((r as any).notes?.trim() && validItems.length > 0) {
      const noteText = (r as any).notes.trim()
      for (const it of validItems) {
        const vg = vendorGroupLookup[it.item_name]
        const key = (vg && it.item_name !== it.resolved_col)
          ? `_col_${vg}_${it.resolved_col}`
          : it.resolved_col
        dd.notes[key] = dd.notes[key] ? `${dd.notes[key]}\n${noteText}` : noteText
      }
    }
    // Route tax_amount: 耗材 → '免洗稅金'; food/misc → vendor-specific '稅金' column
    // 把 receipt 的品項名稱一起帶到 key 內，fillWorksheet 可優先寫進
    // 品項專屬稅金欄（例如 "豆腐稅金" 收 油豆腐 receipt 的稅）。
    const taxAmt = (r.tax_amount ?? 0) as number
    if (taxAmt > 0 && positiveItems.length > 0) {
      const hasPackItem = positiveItems.some((it: any) =>
        categoryLookup[it.item_name] === '耗材' || packCols.includes(it.resolved_col)
      )
      if (hasPackItem) {
        dd.items['免洗稅金'] = (dd.items['免洗稅金'] || 0) + taxAmt
      } else {
        const vg = positiveItems
          .map((it: any) => vendorGroupLookup[it.item_name] ?? vendorGroupLookup[it.resolved_col])
          .find(Boolean)
        // 把品項名稱以 | 分隔附在 key 後，fillWorksheet 用來找 item-specific 稅金欄
        const itemNames = [...new Set(positiveItems.map((it: any) => it.item_name as string).filter(Boolean))].join('|')
        const taxKey = vg ? `_tax_${vg}::${itemNames}` : '稅金'
        dd.items[taxKey] = (dd.items[taxKey] || 0) + taxAmt
      }
    }
    // Items stay at exactly what the user entered; no proportional distribution.
    // (Food receipts: total includes tax but tax field may be blank; distributing would inflate items.
    //  Pack receipts: tax is already routed to 免洗稅金 above, leaving no remainder.)
    if (r.receipt_type === 'invoice') invoiceTotal += r.total_amount ?? 0
    else if (r.receipt_type === 'receipt') receiptTotal += r.total_amount ?? 0
  }

  for (const c of closings ?? []) {
    const dd = ensureDay(c.business_date)
    dd.revenue  = c.total_revenue  ?? 0
    dd.actual   = c.actual_remit   ?? 0
    dd.variance = c.variance       ?? 0

    let handwriteSum = 0
    for (const rv of (c.revenue_items as any[]) ?? []) {
      // POS 欄只記實際的 POS channel；handwrite 走 onsite，避免被當成 POS 寫入 Excel POS 欄
      if (rv.channel === 'pos') dd.pos += rv.gross_amount ?? 0
      if (rv.channel === 'handwrite') handwriteSum += rv.gross_amount ?? 0
      if (rv.channel === 'twpay') dd.twpay  += rv.gross_amount ?? 0
      if (rv.channel === 'panda') dd.panda  += rv.gross_amount ?? 0
      if (rv.channel === 'online') dd.online += rv.gross_amount ?? 0
      if (rv.channel === 'online_cash') dd.online_cash += rv.gross_amount ?? 0
      if (rv.channel === 'uber' && rv.account_name) {
        dd.uber[rv.account_name] = (dd.uber[rv.account_name] || 0) + (rv.gross_amount ?? 0)
      }
    }
    const uberSum = Object.values(dd.uber).reduce((s, v) => s + v, 0)
    // ichef_uber_linked = true：iChef POS 含各平台，需扣除得到現場
    // ichef_uber_linked = false：POS 已是純現場金額
    // handwriteSum 永遠加進現場（手寫菜單是純現場交易）
    dd.onsite = (ichefLinked ? (dd.pos - uberSum - dd.twpay - dd.panda - dd.online) : dd.pos) + handwriteSum

    let ckItemsSum = 0
    let ckSummarySum = 0
    for (const oi of (c.order_items as any[]) ?? []) {
      if (oi.item_name === '央廚配送') {
        // 累加，不直接覆寫；資料異常時不會吃掉前面的紀錄
        ckSummarySum += oi.total_amount ?? 0
      } else {
        // Individual CK items → map to their excel column
        const excelCol = mappingLookup[oi.item_name] ?? ckColLookup[oi.item_name] ?? oi.item_name
        if (excelCol && (oi.total_amount || 0) > 0) {
          dd.items[excelCol] = (dd.items[excelCol] || 0) + (oi.total_amount as number)
        }
        // Accumulate CK subtotal (for fallback when no '央廚配送' summary exists)
        if ((oi.item_name in ckColLookup) && (oi.total_amount || 0) > 0) {
          ckItemsSum += oi.total_amount as number
        }
      }
    }
    // summary 優先，沒有再 fallback 到分項累加
    dd.ck = ckSummarySum > 0 ? ckSummarySum : ckItemsSum
  }

  // Debug: log what values are written per date (check Vercel function logs)
  for (const [date, d] of Object.entries(byDate)) {
    const keys = Object.keys(d.items)
    if (keys.length > 0) {
      console.log(`[food-cost] ${storeId} ${date}:`, JSON.stringify(d.items))
    }
  }

  // ─── Compute data rows & monthly totals (needed before writing headers) ──────
  const days = getDaysInMonth(year, monthNum)

  const dataRows: Array<{ date: string; row: RowVals }> = days.map(date => {
    const d = byDate[date]
    const pos     = d?.pos ?? 0
    const twpay   = d?.twpay ?? 0
    const panda   = d?.panda ?? 0
    const online  = d?.online ?? 0
    const online_cash = d?.online_cash ?? 0
    const uber    = d?.uber ?? {}
    const onsite  = d?.onsite ?? 0
    const actual  = d?.actual ?? 0
    const ck      = d?.ck ?? 0
    const variance = d?.variance ?? 0
    // 扣除後的$ = 實際$ − 配送(月底結) − 結果
    const after_deduct = actual - ck - variance
    // 「營業額」欄沿用 onsite + variance（模板若有公式會保留不覆寫）
    const computedRevenue = onsite + variance
    // 「(手動)POS」欄要寫 DB 的真實總營業額（含所有 channel）
    const totalRevenue = d?.revenue ?? 0
    const items = d?.items ?? {}
    const notes = d?.notes ?? {}
    const foodTotal = foodCols.reduce((s, col) => s + (items[col] || 0), 0)
    const packTotal = packCols.reduce((s, col) => s + (items[col] || 0), 0)
    const miscTotal = miscCols.reduce((s, col) => s + (items[col] || 0), 0)
    const grandTotal = foodTotal + packTotal + miscTotal
    return {
      date, row: {
        pos, twpay, panda, online, online_cash, uber, after_deduct, onsite, actual, ck, result: variance,
        revenue: computedRevenue, totalRevenue,
        items, notes, foodTotal, packTotal, miscTotal, grandTotal,
      },
    }
  })

  const sumOf = (fn: (r: RowVals) => number) => dataRows.reduce((s, { row }) => s + fn(row), 0)
  const totals: RowVals = {
    pos:          sumOf(r => r.pos),
    twpay:        sumOf(r => r.twpay),
    panda:        sumOf(r => r.panda),
    online:       sumOf(r => r.online),
    online_cash:  sumOf(r => r.online_cash ?? 0),
    uber:         Object.fromEntries(uberAccounts.map(acc => [acc, dataRows.reduce((s, { row }) => s + (row.uber[acc] ?? 0), 0)])),
    after_deduct: sumOf(r => r.after_deduct),
    onsite:       sumOf(r => r.onsite),
    actual:       sumOf(r => r.actual),
    ck:           sumOf(r => r.ck),
    result:       sumOf(r => r.result),
    revenue:      sumOf(r => r.revenue),
    totalRevenue: dataRows.reduce((s, { row }) => s + (row.totalRevenue ?? 0), 0),
    items:        Object.fromEntries([...foodCols, ...packCols, ...miscCols].map(col => [
      col, dataRows.reduce((s, { row }) => s + (row.items[col] || 0), 0),
    ])),
    notes:        {},
    foodTotal:    sumOf(r => r.foodTotal),
    packTotal:    sumOf(r => r.packTotal),
    miscTotal:    sumOf(r => r.miscTotal),
    grandTotal:   sumOf(r => r.grandTotal),
  }
  // 梁平退稅 = 當月免洗稅金合計
  const lianpingTaxRefund = totals.items['免洗稅金'] ?? 0

  // ─── Template mode: fill original Excel if uploaded ───────────────────────
  // 重用先前下載的 templateBuffer
  let templateDebug = 'no_template'
  if (templateBuffer) {
    try {
      templateDebug = 'fill_attempt'
      const result = await fillTemplate(templateBuffer, monthNum, year, days, dataRows, storeRow?.name ?? 'export', uberAccounts, vendorGroupLookup)
      if (result) {
        result.headers.set('X-Export-Mode', 'template')
        return result
      }
      templateDebug = 'fill_null'
      console.warn(`[food-cost export] fillTemplate returned null for store ${storeId}, month ${month}`)
    } catch (e) {
      templateDebug = `exception:${(e as Error)?.message ?? e}`
      console.warn(`[food-cost export] template fill failed:`, e)
    }
  }

  // ─── Excel workbook ───────────────────────────────────────────────────────
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

  // Subtotal N-Q: 梁平退稅 label + 免洗稅金 value
  styleHeader(1, COL_TOTAL,    '梁平退稅',           C.BFBFBF, true)
  styleHeader(1, COL_FOOD_SUB, lianpingTaxRefund || '', C.FFFF00, true)
  styleHeader(1, COL_PACK_SUB, '',                   C.BFBFBF, false)
  styleHeader(1, COL_MISC_SUB, '',                   C.BFBFBF, false)

  // Vendor groups for food items
  const vendorGroups = [
    { name: '央廚配送', start: COL_FOOD_START,      end: COL_FOOD_START + 5,   color: C.NONE },   // 6 cols
    { name: '振源',     start: COL_FOOD_START + 6,  end: COL_FOOD_START + 6,   color: C.DA9694 }, // 1 col
    { name: '小雲',     start: COL_FOOD_START + 7,  end: COL_FOOD_START + 7,   color: C.C6D9F0 }, // 1 col
    { name: '菜商',     start: COL_FOOD_START + 8,  end: COL_FOOD_START + 16,  color: C.FDE9D9 }, // 9 cols
    { name: '雜貨',     start: COL_FOOD_START + 17, end: COL_FOOD_START + 23,  color: C.FBD4B4 }, // 7 cols
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

  // ─── ROW 2: 總發票 / 總收據 info row ────────────────────────────────────────
  // Revenue section A..L: light yellow, no text
  for (let col = 0; col < COL_REVENUE + 1; col++) {
    styleHeader(2, col, '', C.FFFFCC, false)
  }
  gc(2, COL_SPACER).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
  styleHeader(2, COL_TOTAL,    '總發票',              C.BFBFBF, true)
  styleHeader(2, COL_FOOD_SUB, invoiceTotal || '',    C.FFFF00, true)
  styleHeader(2, COL_PACK_SUB, '總收據',              C.BFBFBF, true)
  styleHeader(2, COL_MISC_SUB, receiptTotal || '',    C.FFFF00, true)
  // Food/pack/misc header cells in row 2: just gray background
  for (let col = COL_ITEMS_START; col < TOTAL_COLS; col++) {
    styleHeader(2, col, '', C.BFBFBF, false)
  }

  // ─── ROW 3: Column headers ──────────────────────────────────────────────────
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
    const cell = gc(3, ci)
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
      if (row.notes[foodCols[i]]) gc(excelRow, COL_FOOD_START + i).note = row.notes[foodCols[i]]
    }
    // Pack items: light blue
    for (let i = 0; i < packCols.length; i++) {
      styleData(excelRow, COL_PACK_START + i, numOrBlank(row.items[packCols[i]] || 0), C.C6D9F0)
      if (row.notes[packCols[i]]) gc(excelRow, COL_PACK_START + i).note = row.notes[packCols[i]]
    }
    // Misc variable [0:13]: light blue
    for (let i = 0; i < 13; i++) {
      styleData(excelRow, COL_MISC_START + i, numOrBlank(row.items[miscCols[i]] || 0), C.C6D9F0)
      if (row.notes[miscCols[i]]) gc(excelRow, COL_MISC_START + i).note = row.notes[miscCols[i]]
    }
    // Misc fixed [13:]: peach
    for (let i = 13; i < miscCols.length; i++) {
      styleData(excelRow, COL_MISC_START + i, numOrBlank(row.items[miscCols[i]] || 0), C.FBD4B4)
      if (row.notes[miscCols[i]]) gc(excelRow, COL_MISC_START + i).note = row.notes[miscCols[i]]
    }
  }

  // Write monthly totals row (row 4)
  writeRowData(4, null, totals, C.FFFF00)

  // Write daily rows starting from row 5
  dataRows.forEach(({ date, row }, i) => {
    writeRowData(5 + i, date, row, C.FFFFCC)
  })

  // ─── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(1).height = 18  // vendor groups
  ws.getRow(2).height = 16  // invoice/receipt info
  ws.getRow(3).height = 20  // column headers
  ws.getRow(4).height = 18  // monthly totals
  for (let i = 0; i < days.length; i++) ws.getRow(5 + i).height = 16

  // ─── Output ─────────────────────────────────────────────────────────────────
  const storeName = storeRow?.name ?? 'export'
  const filename  = encodeURIComponent(`${storeName}_${year}${String(monthNum).padStart(2, '0')}_食耗成本.xlsx`)

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'X-Template-Debug': templateDebug,
    },
  })
}
