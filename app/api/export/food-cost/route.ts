import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getDaysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get('storeId')
  const month   = searchParams.get('month') // YYYY-MM
  if (!storeId || !month) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

  const [yearStr, monthStr] = month.split('-')
  const year     = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay  = new Date(year, monthNum, 0).toISOString().slice(0, 10)

  const admin = createAdminClient()
  const [{ data: receipts }, { data: closings }, { data: storeRow }] = await Promise.all([
    admin.from('receipts')
      .select('business_date, receipt_items(excel_column, amount, item_category)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('daily_closings')
      .select('business_date, total_revenue, actual_remit, revenue_items(channel, gross_amount)')
      .eq('store_id', storeId)
      .gte('business_date', firstDay).lte('business_date', lastDay),
    admin.from('stores').select('name').eq('id', storeId).single(),
  ])

  // Build per-date lookup
  interface DayData {
    items: Record<string, number>
    revenue: number; pos: number; twpay: number
    uber: number; panda: number; actual_remit: number
  }
  const byDate: Record<string, DayData> = {}
  function ensureDay(d: string) {
    if (!byDate[d]) byDate[d] = { items: {}, revenue: 0, pos: 0, twpay: 0, uber: 0, panda: 0, actual_remit: 0 }
  }

  for (const r of receipts ?? []) {
    ensureDay(r.business_date)
    for (const it of (r.receipt_items as any[]) ?? []) {
      if (it.excel_column) {
        byDate[r.business_date].items[it.excel_column] =
          (byDate[r.business_date].items[it.excel_column] || 0) + (it.amount || 0)
      }
    }
  }
  for (const c of closings ?? []) {
    ensureDay(c.business_date)
    const dd = byDate[c.business_date]
    dd.revenue      = c.total_revenue  ?? 0
    dd.actual_remit = c.actual_remit   ?? 0
    for (const rv of (c.revenue_items as any[]) ?? []) {
      if (rv.channel === 'pos')   dd.pos   += rv.gross_amount ?? 0
      if (rv.channel === 'twpay') dd.twpay += rv.gross_amount ?? 0
      if (rv.channel === 'uber')  dd.uber  += rv.gross_amount ?? 0
      if (rv.channel === 'panda') dd.panda += rv.gross_amount ?? 0
    }
  }

  const allItemCols = [
    ...EXCEL_COLUMNS['食材'],
    ...EXCEL_COLUMNS['耗材'],
    ...EXCEL_COLUMNS['雜項'],
  ]

  // Header rows
  const header1 = [
    '', '', '', '', '', '', '', '', '',
    '', '食材', '耗材', '雜項',
    ...EXCEL_COLUMNS['食材'].map(() => '食材'),
    ...EXCEL_COLUMNS['耗材'].map(() => '耗材'),
    ...EXCEL_COLUMNS['雜項'].map(() => '雜項'),
  ]
  const header2 = [
    '日期', '星期', 'POS', 'TWPAY', 'Uber Eats', '熊貓', '營業額', '實際匯款', '',
    '食耗總計', '食材小計', '耗材小計', '雜項小計',
    ...allItemCols,
  ]

  // Data rows
  const days = getDaysInMonth(year, monthNum)
  const dataRows = days.map(date => {
    const d = byDate[date]
    const foodTotal = EXCEL_COLUMNS['食材'].reduce((s, col) => s + (d?.items[col] || 0), 0)
    const packTotal = EXCEL_COLUMNS['耗材'].reduce((s, col) => s + (d?.items[col] || 0), 0)
    const miscTotal = EXCEL_COLUMNS['雜項'].reduce((s, col) => s + (d?.items[col] || 0), 0)
    const totalCost = foodTotal + packTotal + miscTotal
    const dt = new Date(date + 'T12:00:00+08:00')

    return [
      date,
      `星期${WEEKDAYS[dt.getDay()]}`,
      d?.pos      || '',
      d?.twpay    || '',
      d?.uber     || '',
      d?.panda    || '',
      d?.revenue  || '',
      d?.actual_remit || '',
      '',
      totalCost || '',
      foodTotal || '',
      packTotal || '',
      miscTotal || '',
      ...allItemCols.map(col => d?.items[col] || ''),
    ]
  })

  // Monthly totals row
  const totalRow = [
    `${monthNum}月合計`, '',
    ...Array(7).fill(''),
    dataRows.reduce((s, r) => s + (Number(r[9]) || 0), 0),
    dataRows.reduce((s, r) => s + (Number(r[10]) || 0), 0),
    dataRows.reduce((s, r) => s + (Number(r[11]) || 0), 0),
    dataRows.reduce((s, r) => s + (Number(r[12]) || 0), 0),
    ...allItemCols.map((_, ci) => dataRows.reduce((s, r) => s + (Number(r[13 + ci]) || 0), 0)),
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...dataRows, totalRow])

  // Column widths
  ws['!cols'] = header2.map((h, i) => ({
    wch: i < 2 ? 12 : i === 0 ? 12 : Math.max(String(h).length * 2.2, 8)
  }))

  const sheetName = `${monthNum}月食耗成本`
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const storeName = storeRow?.name ?? 'export'
  const filename = encodeURIComponent(`${storeName}_${year}${String(monthNum).padStart(2, '0')}_食耗成本.xlsx`)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
