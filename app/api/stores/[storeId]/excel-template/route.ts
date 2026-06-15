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

type ColItem = { name: string; col: number }
type ParsedColumns = { 食材: ColItem[]; 耗材: ColItem[]; 雜項: ColItem[] }

function parseColumns(ws: ExcelJS.Worksheet): ParsedColumns | null {
  // Find header row (col A = '日期')
  let headerRowNum = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
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

  // Collect item names with column positions
  const allItems: ColItem[] = []
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
    食材: allItems.filter((_, i) => assigned[i] === 'food'),
    耗材: allItems.filter((_, i) => assigned[i] === 'pack'),
    雜項: allItems.filter((_, i) => assigned[i] === 'misc'),
  }
}

/** Returns vendor group keyed by column number (not column name), so duplicate-named columns get distinct groups. */
function getVendorGroupByCol(ws: ExcelJS.Worksheet, headerRowNum: number): Record<number, string> {
  const groupRowNum = headerRowNum - 2
  if (groupRowNum < 1) return {}

  const itemCols = new Set<number>()
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (t && !SKIP_HEADERS.has(t) && !/^\d/.test(t) && t.length <= 15) itemCols.add(colNum)
  })
  if (itemCols.size === 0) return {}
  const minItemCol = Math.min(...itemCols)

  const groupStarts: Array<{ col: number; name: string }> = []
  ws.getRow(groupRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (colNum < minItemCol) return
    if (cell.value instanceof Date) return
    const t = cell.text?.trim()
    if (t && !/^\d/.test(t) && t.length >= 1 && t.length <= 20) groupStarts.push({ col: colNum, name: t })
  })
  if (groupStarts.length === 0) return {}

  const result: Record<number, string> = {}
  for (const colNum of itemCols) {
    let group = ''
    for (const gs of groupStarts) { if (gs.col <= colNum) group = gs.name }
    if (group) result[colNum] = group
  }
  return result
}

const SKIP_HEADERS = new Set([
  '日期', '星期', 'POS', 'TWPAY', '扣除後的$', '現場', '實際$',
  '配送(月底結)', '配送月底結', '結果', '營業額', '總', '食材', '耗材', '雜項',
])


// Flexible parser: categorize by existing mappings + EXCEL_COLUMNS, no subtotal columns needed
function parseColumnsFlexible(
  ws: ExcelJS.Worksheet,
  categoryMap: Record<string, string>
): ParsedColumns | null {
  let headerRowNum = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) return null

  const result: ParsedColumns = { 食材: [], 耗材: [], 雜項: [] }
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    // Skip Date cells (transposed Excel where dates are column headers)
    if (cell.value instanceof Date) return
    // Skip object cells ([object Object]) — only allow string/number values
    if (typeof cell.value === 'object' && cell.value !== null) {
      // Allow rich text objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!('richText' in (cell.value as any))) return
    }
    const t = cell.text?.trim()
    if (!t || SKIP_HEADERS.has(t) || /^\d/.test(t)) return
    if (t.length > 15) return  // column names shouldn't be this long (dates as strings are 40+ chars)
    const cat = categoryMap[t]
    if (cat === '食材' || cat === '耗材' || cat === '雜項') result[cat].push({ name: t, col: colNum })
    // Unknown short strings: only include if they look like item names (exist in categoryMap)
    // Don't add completely unknown columns to avoid noise
  })
  const total = result['食材'].length + result['耗材'].length + result['雜項'].length
  return total > 0 ? result : null
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

  const admin = createAdminClient()
  await ensureBucket(admin)

  // Upload Excel file first (template fill doesn't need parsed columns)
  const { error: xlsxErr } = await admin.storage.from(BUCKET).upload(
    `${storeId}.xlsx`, new Uint8Array(arrayBuffer), { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  )
  if (xlsxErr) return NextResponse.json({ error: xlsxErr.message }, { status: 500 })

  // Try structured parseColumns first, fallback to flexible parser
  let columns: ReturnType<typeof parseColumns> = null
  let wsUsed: ExcelJS.Worksheet | null = null
  for (const ws of wb.worksheets) {
    columns = parseColumns(ws)
    if (columns) { wsUsed = ws; break }
  }
  if (!columns) {
    // Build category map from EXCEL_COLUMNS + existing store/global mappings
    const { data: existingMappings } = await admin
      .from('item_column_mappings')
      .select('item_name, item_category, excel_column')
      .or(`store_id.is.null,store_id.eq.${storeId}`)
    const categoryMap: Record<string, string> = {}
    for (const [cat, names] of Object.entries(EXCEL_COLUMNS)) {
      for (const n of names) categoryMap[n] = cat
    }
    for (const m of (existingMappings ?? []) as any[]) {
      if (m.item_name)    categoryMap[m.item_name]    = m.item_category
      if (m.excel_column) categoryMap[m.excel_column] = m.item_category
    }
    for (const ws of wb.worksheets) {
      columns = parseColumnsFlexible(ws, categoryMap)
      if (columns) { wsUsed = ws; break }
    }
  }
  // Save upload metadata (original filename + timestamp)
  const meta = { filename: file.name, uploadedAt: new Date().toISOString() }
  await admin.storage.from(BUCKET).upload(
    `${storeId}-meta.json`,
    new TextEncoder().encode(JSON.stringify(meta)),
    { upsert: true, contentType: 'application/json' }
  )

  if (columns) {
    // Save columns.json with plain string arrays (backward compatible with route.ts/google-sheets.ts readers)
    const colsForJson = {
      食材: columns['食材'].map(c => c.name),
      耗材: columns['耗材'].map(c => c.name),
      雜項: columns['雜項'].map(c => c.name),
    }
    const colBuf = new TextEncoder().encode(JSON.stringify(colsForJson))
    await admin.storage.from(BUCKET).upload(`${storeId}-columns.json`, colBuf, { upsert: true, contentType: 'application/json' })

    // Get vendor groups keyed by column NUMBER (handles duplicate column names correctly)
    let vendorGroupByCol: Record<number, string> = {}
    let headerRowNum = -1
    if (wsUsed) {
      for (let r = 1; r <= 10; r++) {
        if (wsUsed.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
      }
      if (headerRowNum > 2) vendorGroupByCol = getVendorGroupByCol(wsUsed, headerRowNum)
    }

    // Build flat list with column positions and categories
    const allCols = [
      ...columns['食材'].map(c => ({ ...c, cat: '食材' })),
      ...columns['耗材'].map(c => ({ ...c, cat: '耗材' })),
      ...columns['雜項'].map(c => ({ ...c, cat: '雜項' })),
    ]

    // Count occurrences of each column name to detect duplicates
    const nameCount: Record<string, number> = {}
    for (const c of allCols) nameCount[c.name] = (nameCount[c.name] || 0) + 1

    // Fetch both global and store-specific existing mappings
    const { data: allExisting } = await admin.from('item_column_mappings')
      .select('item_name, vendor_group, store_id')
      .or(`store_id.is.null,store_id.eq.${storeId}`)

    // Global keys: "item_name|vendor_group" combinations already handled universally
    const globalKeys = new Set<string>()
    const storeItemNames = new Set<string>()
    for (const m of (allExisting ?? []) as any[]) {
      if (!m.store_id) globalKeys.add(`${m.item_name}|${m.vendor_group ?? ''}`)
      else storeItemNames.add(m.item_name)
    }

    // Track (name, vg) occurrences to handle duplicates within the same vendor group
    const seenCombo: Record<string, number> = {}
    const newMappings: any[] = []
    const orderedItemNames: string[] = [] // Excel column order for dropdown sorting

    for (const c of allCols) {
      const vg = vendorGroupByCol[c.col] ?? null
      const comboKey = `${c.name}|${vg ?? ''}`
      const occurrence = (seenCombo[comboKey] || 0) + 1
      seenCombo[comboKey] = occurrence

      // Determine item_name for dropdown display (needed before skip checks for order tracking):
      // - duplicate names with different vendor groups → prefix with vendor group (e.g. "翁師傅其他")
      // - same (name, vg) appears again → numbered suffix (e.g. "其他2", "退稅其他2")
      let itemName: string
      if (occurrence === 1) {
        itemName = (nameCount[c.name] > 1 && vg) ? `${vg}${c.name}` : c.name
      } else {
        itemName = vg ? `${vg}${c.name}${occurrence}` : `${c.name}${occurrence}`
      }

      // Always track position (including items already covered by global mappings)
      orderedItemNames.push(itemName)

      // First occurrence of (name, vg): skip if a global mapping already covers it
      if (occurrence === 1 && globalKeys.has(comboKey)) continue

      if (storeItemNames.has(itemName)) continue
      storeItemNames.add(itemName)

      newMappings.push({
        item_name: itemName,
        excel_column: c.name,
        item_category: c.cat,
        vendor_group: vg,
        store_id: storeId,
        updated_at: new Date().toISOString(),
      })
    }

    if (newMappings.length > 0) {
      const { error: insertErr } = await admin.from('item_column_mappings').insert(newMappings)
      if (insertErr) console.warn('[excel-template] mapping insert error:', insertErr.message, JSON.stringify(newMappings.map(m => m.item_name)))
    }

    // Save item order file so closing form dropdown matches Excel column order
    await admin.storage.from(BUCKET).upload(
      `${storeId}-item-order.json`,
      new TextEncoder().encode(JSON.stringify(orderedItemNames)),
      { upsert: true, contentType: 'application/json' }
    )
  }

  return NextResponse.json({
    success: true,
    counts: columns ? { 食材: columns['食材'].length, 耗材: columns['耗材'].length, 雜項: columns['雜項'].length } : null,
    columns: columns ? { 食材: columns['食材'].map(c => c.name), 耗材: columns['耗材'].map(c => c.name), 雜項: columns['雜項'].map(c => c.name) } : null,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })

  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([`${storeId}.xlsx`, `${storeId}-columns.json`, `${storeId}-item-order.json`])
  return NextResponse.json({ success: true })
}
