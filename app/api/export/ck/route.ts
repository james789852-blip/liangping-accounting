import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedUser } from '@/lib/authed-user'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getMonthLastDay } from '@/lib/business-date'
import { buildCKDataMap, materializeCKCrossSheetFormulas, prepareCKTemplateStoreColumns, fillCKWorksheet, type CKDayData } from '@/lib/ck-template'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const BUCKET = 'excel-templates'
const FONT_FAMILY = 'Microsoft JhengHei'
const HEADER_FONT_SIZE = 14
const DATA_FONT_SIZE = 13

function getDaysInMonth(year: number, month: number) {
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

type DayData = CKDayData

function appendStoreOrdersSheet(
  wb: ExcelJS.Workbook,
  days: string[],
  dataMap: Record<string, DayData>,
  assignedStoreNames: string[],
) {
  const externalNames = [...new Set(
    Object.values(dataMap).flatMap(d => Object.keys(d.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name))
  )]
  const allStoreNames = [...assignedStoreNames, ...externalNames]
  if (allStoreNames.length === 0) return

  const sheetName = '各店叫貨'
  const existing = wb.getWorksheet(sheetName)
  if (existing) wb.removeWorksheet(existing.id)
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] })

  const headers = ['日期', '星期', ...allStoreNames, '合計']
  const headerRow = ws.addRow(headers)
  headerRow.height = 28
  headerRow.eachCell(cell => {
    cell.font = { name: FONT_FAMILY, size: HEADER_FONT_SIZE, bold: true, color: { argb: 'FF7C2D12' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: { style: 'thin', color: { argb: 'FFB8B8B8' } }, bottom: { style: 'thin', color: { argb: 'FFB8B8B8' } }, left: { style: 'thin', color: { argb: 'FFB8B8B8' } }, right: { style: 'thin', color: { argb: 'FFB8B8B8' } } }
  })

  for (const date of days) {
    const d = dataMap[date]
    const dt = new Date(date + 'T00:00:00+08:00')
    const cols = allStoreNames.map(name => d?.storeRevenues[name] ?? null)
    const total = d?.totalRevenue ?? null
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
    const row = ws.addRow([date, `星期${WEEKDAYS[dt.getDay()]}`, ...cols, total])
    row.height = 22
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = {
        name: FONT_FAMILY, size: DATA_FONT_SIZE,
        color: isWeekend && col <= 2 ? { argb: dt.getDay() === 0 ? 'FFDC2626' : 'FF0369A1' } : { argb: 'FF18181B' },
        bold: isWeekend && col <= 2,
      }
      cell.alignment = { horizontal: col <= 2 ? 'center' : 'right', vertical: 'middle' }
      if (typeof cell.value === 'number') cell.numFmt = '#,##0;-#,##0;"-"'
    })
  }

  // 月合計列
  const totalsRow: (string | number | null)[] = ['月合計', '']
  for (const name of allStoreNames) {
    let sum = 0
    for (const date of days) sum += dataMap[date]?.storeRevenues[name] ?? 0
    totalsRow.push(sum || null)
  }
  let grand = 0
  for (const date of days) grand += dataMap[date]?.totalRevenue ?? 0
  totalsRow.push(grand || null)
  const trow = ws.addRow(totalsRow)
  trow.height = 26
  trow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: FONT_FAMILY, size: DATA_FONT_SIZE + 1, bold: true, color: { argb: 'FF7C2D12' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (typeof cell.value === 'number') cell.numFmt = '#,##0;-#,##0;"-"'
  })

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 9
  for (let c = 3; c <= headers.length; c++) {
    ws.getColumn(c).width = Math.max(headers[c - 1].length * 2.2 + 3, 12)
  }
}

async function fillTemplate(
  templateBlob: Blob,
  monthNum: number,
  year: number,
  days: string[],
  dataMap: Record<string, DayData>,
  ckStoreName: string,
  assignedStoreNames: string[],
): Promise<NextResponse | null> {
  const wb = new ExcelJS.Workbook()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(await templateBlob.arrayBuffer()) as any)
  } catch (e) { console.warn('[ck-export] template load failed:', e); return null }

  const targetName = `${monthNum}月食耗成本`
  const ws = wb.getWorksheet(targetName)
    ?? wb.worksheets.find(s => s.name.includes('食耗'))
    ?? wb.worksheets[0]
  if (!ws) { console.warn('[ck-export] no sheet found'); return null }

  const externalStoreNames = [...new Set(
    Object.values(dataMap).flatMap(day => Object.keys(day.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name)),
  )]
  if (!prepareCKTemplateStoreColumns(ws, [...assignedStoreNames, ...externalStoreNames])) {
    console.warn('[ck-export] template has too few store columns')
    return null
  }

  const filled = fillCKWorksheet(ws, days, dataMap)
  if (!filled) { console.warn('[ck-export] no header row'); return null }
  materializeCKCrossSheetFormulas(ws)


  // 附加「各店叫貨」sheet
  appendStoreOrdersSheet(wb, days, dataMap, assignedStoreNames)

  const filename = encodeURIComponent(`${ckStoreName}_${year}${String(monthNum).padStart(2, '0')}_央廚食耗.xlsx`)
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
  const user = await getVerifiedUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ckStoreId = searchParams.get('ckStoreId')
  const month = searchParams.get('month')
  if (!ckStoreId || !month) return NextResponse.json({ error: '缺少參數' }, { status: 400 })

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr)
  const monthNum = parseInt(monthStr)
  const firstDay = `${month}-01`
  const lastDay = getMonthLastDay(year, monthNum)

  const admin = createAdminClient()

  const { data: ckStore } = await admin
    .from('stores').select('id, name, assigned_store_ids').eq('id', ckStoreId).single()
  if (!ckStore) return NextResponse.json({ error: '找不到央廚店家' }, { status: 404 })

  const assignedIds: string[] = (ckStore.assigned_store_ids as string[] | null) ?? []
  const { data: memberStores } = assignedIds.length > 0
    ? await admin.from('stores').select('id, name').in('id', assignedIds)
    : { data: [] }
  const storeNameMap = Object.fromEntries((memberStores ?? []).map((s: any) => [s.id as string, s.name as string]))

  const { data: records } = await admin
    .from('ck_daily_records')
    .select('id, business_date')
    .eq('ck_store_id', ckStoreId)
    .gte('business_date', firstDay)
    .lte('business_date', lastDay)

  const recordIds = (records ?? []).map(r => r.id)

  const [{ data: storeOrders }, { data: expenseItems }] = await Promise.all([
    recordIds.length > 0
      ? admin.from('ck_store_orders').select('ck_daily_record_id, store_id, external_store_name, amount, ck_confirmed_amount').in('ck_daily_record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? admin.from('ck_expense_items').select('ck_daily_record_id, category, item_name, amount').in('ck_daily_record_id', recordIds).order('sort_order')
      : Promise.resolve({ data: [] }),
  ])

  const days = getDaysInMonth(year, monthNum)
  const dataMap = buildCKDataMap(records ?? [], storeOrders ?? [], expenseItems ?? [], storeNameMap)

  // Try template fill
  try {
    const { data: tmpl, error: dlErr } = await admin.storage.from(BUCKET).download(`ck-${ckStoreId}.xlsx`)
    if (!dlErr && tmpl) {
      const assignedNames = assignedIds.map(id => storeNameMap[id]).filter(Boolean)
      const result = await fillTemplate(tmpl, monthNum, year, days, dataMap, ckStore.name as string, assignedNames)
      if (result) { result.headers.set('X-Export-Mode', 'template'); return result }
    }
  } catch (e) { console.warn('[ck-export] template failed:', e) }

  // Fallback: generate simple Excel
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CK Accounting'
  const ws = wb.addWorksheet(`${monthNum}月食耗成本`, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  })

  // Build store columns (assigned first, then external stores found in data)
  const assignedStoreNames = assignedIds.map(id => storeNameMap[id]).filter(Boolean)
  const externalNames = [...new Set(
    Object.values(dataMap).flatMap(d => Object.keys(d.storeRevenues))
      .filter(name => !assignedStoreNames.includes(name))
  )]
  const allStoreNames = [...assignedStoreNames, ...externalNames]

  const headers = ['日期', '星期', ...allStoreNames, '營業額', '食材', '耗材', '雜項', '總支出']
  const headerRow = ws.addRow(headers)
  headerRow.height = 30
  headerRow.eachCell(cell => {
    cell.font = { name: FONT_FAMILY, size: HEADER_FONT_SIZE, bold: true, color: { argb: 'FF7C2D12' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: { style: 'thin', color: { argb: 'FFB8B8B8' } }, bottom: { style: 'thin', color: { argb: 'FFB8B8B8' } }, left: { style: 'thin', color: { argb: 'FFB8B8B8' } }, right: { style: 'thin', color: { argb: 'FFB8B8B8' } } }
  })

  for (const date of days) {
    const d = dataMap[date]
    const dt = new Date(date + 'T00:00:00+08:00')
    const storeRevCols = allStoreNames.map(name => d?.storeRevenues[name] ?? null)
    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
    const row = ws.addRow([
      date,
      `星期${WEEKDAYS[dt.getDay()]}`,
      ...storeRevCols,
      d?.totalRevenue || null,
      d?.foodTotal || null,
      d?.packTotal || null,
      d?.miscTotal || null,
      d?.totalExpense || null,
    ])
    row.height = 22
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = {
        name: FONT_FAMILY, size: DATA_FONT_SIZE,
        color: isWeekend && col <= 2 ? { argb: dt.getDay() === 0 ? 'FFDC2626' : 'FF0369A1' } : { argb: 'FF18181B' },
        bold: isWeekend && col <= 2,
      }
      cell.alignment = { horizontal: col <= 2 ? 'center' : 'right', vertical: 'middle' }
      if (typeof cell.value === 'number') cell.numFmt = '#,##0;-#,##0;"-"'
    })
  }

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 9
  for (let c = 3; c <= headers.length; c++) {
    ws.getColumn(c).width = Math.max(headers[c - 1].length * 2.2 + 3, 10)
  }

  const filename = encodeURIComponent(`${ckStore.name}_${year}${String(monthNum).padStart(2, '0')}_央廚食耗.xlsx`)
  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'X-Export-Mode': 'generated',
    },
  })
}
