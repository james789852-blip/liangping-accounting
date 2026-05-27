import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'

const BUCKET = 'excel-templates'

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false })
  }
}

function parseColumns(ws: ExcelJS.Worksheet): { 食材: string[]; 耗材: string[]; 雜項: string[] } | null {
  // Find header row (col A = '日期')
  let headerRowNum = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    if (ws.getRow(r).getCell(1).text?.trim() === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) return null

  const row = ws.getRow(headerRowNum)

  // Find subtotal columns: 食材, 耗材, 雜項
  let miscSubCol = -1
  let foodSubCol = -1
  let packSubCol = -1
  row.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (t === '食材') foodSubCol = colNum
    if (t === '耗材') packSubCol = colNum
    if (t === '雜項') miscSubCol = colNum
  })
  if (miscSubCol < 0) return null

  // All item columns come after misc subtotal column
  const itemsStartCol = miscSubCol + 1

  // Collect item names
  const allItems: { name: string; col: number }[] = []
  row.eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (colNum >= itemsStartCol) {
      const name = cell.text?.trim()
      if (name) allItems.push({ name, col: colNum })
    }
  })
  if (allItems.length === 0) return null

  // Assign categories: match against known columns first
  const foodSet = new Set(EXCEL_COLUMNS['食材'])
  const packSet = new Set(EXCEL_COLUMNS['耗材'])
  const miscSet = new Set(EXCEL_COLUMNS['雜項'])

  type Cat = 'food' | 'pack' | 'misc' | null
  const assigned: Cat[] = allItems.map(({ name }) => {
    if (foodSet.has(name)) return 'food'
    if (packSet.has(name)) return 'pack'
    if (miscSet.has(name)) return 'misc'
    return null
  })

  // Find boundaries from known assignments
  const firstPackIdx = assigned.findIndex(a => a === 'pack')
  const firstMiscIdx = assigned.findIndex(a => a === 'misc')
  const lastFoodIdx  = assigned.reduce((last, a, i) => a === 'food' ? i : last, -1)
  const lastPackIdx  = assigned.reduce((last, a, i) => a === 'pack' ? i : last, -1)

  // Fill nulls using positional inference
  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i] !== null) continue
    if (firstPackIdx >= 0 && i < firstPackIdx) {
      assigned[i] = 'food'
    } else if (firstMiscIdx >= 0 && lastPackIdx >= 0 && i > lastFoodIdx && i < firstMiscIdx) {
      assigned[i] = 'pack'
    } else if (firstMiscIdx >= 0 && i > lastPackIdx) {
      assigned[i] = 'misc'
    } else {
      assigned[i] = firstPackIdx < 0 ? 'food' : (firstMiscIdx < 0 ? 'pack' : 'misc')
    }
  }

  return {
    食材: allItems.filter((_, i) => assigned[i] === 'food').map(x => x.name),
    耗材: allItems.filter((_, i) => assigned[i] === 'pack').map(x => x.name),
    雜項: allItems.filter((_, i) => assigned[i] === 'misc').map(x => x.name),
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const admin = createAdminClient()
  const { data: files } = await admin.storage.from(BUCKET).list('', { search: `${storeId}-columns` })
  const exists = (files ?? []).some(f => f.name === `${storeId}-columns.json`)
  if (!exists) return NextResponse.json({ exists: false })

  // Return column counts
  try {
    const { data } = await admin.storage.from(BUCKET).download(`${storeId}-columns.json`)
    if (data) {
      const cols = JSON.parse(await data.text())
      return NextResponse.json({
        exists: true,
        counts: { 食材: cols['食材']?.length ?? 0, 耗材: cols['耗材']?.length ?? 0, 雜項: cols['雜項']?.length ?? 0 },
      })
    }
  } catch {}
  return NextResponse.json({ exists: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '缺少檔案' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()

  // Parse Excel
  const wb = new ExcelJS.Workbook()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(arrayBuffer as any)
  } catch {
    return NextResponse.json({ error: '無法解析 Excel 檔案，請確認格式正確' }, { status: 400 })
  }

  // Try each worksheet until we find one with a valid header row
  let columns: ReturnType<typeof parseColumns> = null
  for (const ws of wb.worksheets) {
    columns = parseColumns(ws)
    if (columns) break
  }

  if (!columns) {
    return NextResponse.json({ error: '找不到有效的標題行（需包含「日期」、「食材」、「耗材」、「雜項」欄位）' }, { status: 400 })
  }

  const admin = createAdminClient()
  await ensureBucket(admin)

  // Upload Excel file
  const { error: xlsxErr } = await admin.storage.from(BUCKET).upload(
    `${storeId}.xlsx`, new Uint8Array(arrayBuffer), { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  )
  if (xlsxErr) return NextResponse.json({ error: xlsxErr.message }, { status: 500 })

  // Save columns JSON
  const colBuf = new TextEncoder().encode(JSON.stringify(columns))
  await admin.storage.from(BUCKET).upload(`${storeId}-columns.json`, colBuf, { upsert: true, contentType: 'application/json' })

  return NextResponse.json({
    success: true,
    counts: { 食材: columns['食材'].length, 耗材: columns['耗材'].length, 雜項: columns['雜項'].length },
    columns,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([`${storeId}.xlsx`, `${storeId}-columns.json`])
  return NextResponse.json({ success: true })
}
