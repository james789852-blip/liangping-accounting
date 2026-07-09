import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EXCEL_COLUMNS } from '@/lib/excel-columns'
import { revalidateTag } from 'next/cache'

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

/**
 * Returns vendor group keyed by column number (not column name).
 * 規則（優先級）：
 *  1. 廠商列（headerRowNum - 2）有文字（含合併） → 用該文字
 *  2. 文件類型列（headerRowNum - 1）有文字（發票/收據/估價單/公司開） → 用該文字
 *  3. 兩列都空 → 「未分類」
 * 避免類似「翁師傅 | (空) 估價單 | ...」中第二欄被誤掛到翁師傅下。
 */
const DOC_TYPE_PATTERNS = ['發票', '收據', '估價單', '公司開']

function getVendorGroupByCol(ws: ExcelJS.Worksheet, headerRowNum: number): Record<number, string> {
  const vendorRowNum = headerRowNum - 2
  const docTypeRowNum = headerRowNum - 1
  if (vendorRowNum < 1) return {}

  const parseA1 = (a1: string) => {
    const m = a1.match(/^\$?([A-Z]+)\$?(\d+)$/)
    if (!m) return { r: 1, c: 1 }
    let c = 0
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
    return { r: parseInt(m[2]), c }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges = ((ws as any).model?.merges as string[] | undefined) ?? []
  const readMerged = (rowNum: number, maxCol: number): string[] => {
    const masterCol = new Map<number, number>()
    for (const m of merges) {
      const [start, end] = m.split(':')
      const s = parseA1(start)
      const e = parseA1(end)
      if (s.r <= rowNum && e.r >= rowNum) {
        for (let c = s.c; c <= e.c; c++) masterCol.set(c, s.c)
      }
    }
    const out: string[] = []
    for (let c = 1; c <= maxCol; c++) {
      const src = masterCol.get(c) ?? c
      out[c] = ws.getRow(rowNum).getCell(src).text?.trim() ?? ''
    }
    return out
  }

  const maxCol = Math.max((ws.columnCount || 0) + 5, 100)
  const vendorTexts = readMerged(vendorRowNum, maxCol)
  const docTexts = docTypeRowNum >= 1 ? readMerged(docTypeRowNum, maxCol) : []

  const result: Record<number, string> = {}
  const valid = (t: string) => t && !/^\d/.test(t) && t.length <= 20
  for (let c = 1; c <= maxCol; c++) {
    const v = vendorTexts[c] ?? ''
    if (valid(v)) { result[c] = v; continue }
    const d = docTexts[c] ?? ''
    if (valid(d) && DOC_TYPE_PATTERNS.some(p => d.includes(p))) {
      result[c] = d
      continue
    }
    result[c] = '未分類'
  }
  return result
}

const SKIP_HEADERS = new Set([
  '日期', '星期', 'POS', 'TWPAY', '扣除後的$', '現場', '實際$',
  '配送(月底結)', '配送月底結', '結果', '營業額', '總', '食材', '耗材', '雜項',
  '線上點餐', '線上點餐(現金)', '線上點餐（現金）', '(手動)POS', '(手動)實際$',
  'Taiwan pay', '熊貓', 'foodpanda', 'panda', 'Uber',
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
    // Build category map from EXCEL_COLUMNS + existing store mappings.
    const { data: existingMappings } = await admin
      .from('item_column_mappings')
      .select('item_name, item_category, excel_column')
      .eq('store_id', storeId)
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

    // 計算每個品項名稱出現幾次 → 多個 vendor 群組下會用 prefix 區分
    const nameCount: Record<string, number> = {}
    for (const c of allCols) nameCount[c.name] = (nameCount[c.name] || 0) + 1

    // Fetch store-specific existing mappings (含 id 與 vendor_group)
    const { data: allExisting } = await admin.from('item_column_mappings')
      .select('id, item_name, vendor_group, store_id')
      .eq('store_id', storeId)

    const storeMappingMap = new Map<string, { id: string; vendor_group: string | null }>()
    for (const m of (allExisting ?? []) as any[]) {
      storeMappingMap.set(m.item_name, { id: m.id as string, vendor_group: (m.vendor_group as string | null) ?? null })
    }

    const seenCombo: Record<string, number> = {}
    const newMappings: any[] = []
    const updates: { id: string; vendor_group: string | null; item_category: string; excel_column: string }[] = []
    const orderedItemNames: string[] = []

    for (const c of allCols) {
      // vg 必為非空字串：row1 → row2 → '未分類'。儲存時若是 '未分類' 寫入 null 以維持與舊查找邏輯相容。
      const vgRaw = vendorGroupByCol[c.col] ?? '未分類'
      const vgForKey = vgRaw === '未分類' ? null : vgRaw
      const comboKey = `${c.name}|${vgRaw === '未分類' ? '' : vgRaw}`
      const occurrence = (seenCombo[comboKey] || 0) + 1
      seenCombo[comboKey] = occurrence

      // 多群組同名 → 加上 vendor 前綴（如「翁師傅其他」「發票其他」），UI 顯示時剝離 prefix
      let itemName: string
      if (occurrence === 1) {
        itemName = (nameCount[c.name] > 1 && vgForKey) ? `${vgForKey}${c.name}` : c.name
      } else {
        itemName = vgForKey ? `${vgForKey}${c.name}${occurrence}` : `${c.name}${occurrence}`
      }

      orderedItemNames.push(itemName)

      const existing = storeMappingMap.get(itemName)
      if (existing) {
        if (existing.vendor_group !== vgForKey) {
          updates.push({ id: existing.id, vendor_group: vgForKey, item_category: c.cat, excel_column: c.name })
        }
        continue
      }

      newMappings.push({
        item_name: itemName,
        excel_column: c.name,
        item_category: c.cat,
        vendor_group: vgForKey,
        store_id: storeId,
        updated_at: new Date().toISOString(),
      })
    }

    if (newMappings.length > 0) {
      const { error: insertErr } = await admin.from('item_column_mappings').insert(newMappings)
      if (insertErr) console.warn('[excel-template] mapping insert error:', insertErr.message, JSON.stringify(newMappings.map(m => m.item_name)))
    }
    if (updates.length > 0) {
      for (const u of updates) {
        await admin.from('item_column_mappings')
          .update({ vendor_group: u.vendor_group, item_category: u.item_category, excel_column: u.excel_column, updated_at: new Date().toISOString() })
          .eq('id', u.id)
      }
      console.log(`[excel-template] updated ${updates.length} existing mappings with vendor_group`)
    }

    // Save item order file so closing form dropdown matches Excel column order
    await admin.storage.from(BUCKET).upload(
      `${storeId}-item-order.json`,
      new TextEncoder().encode(JSON.stringify(orderedItemNames)),
      { upsert: true, contentType: 'application/json' }
    )
  }

  // 失效 unstable_cache 的品項順序與店家對應
  revalidateTag('item-order', 'default')
  revalidateTag('item-mappings', 'default')

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
  revalidateTag('item-order', 'default')
  return NextResponse.json({ success: true })
}
