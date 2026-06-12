// One-shot script: re-upload Excel template for a store, parse vendor groups, update DB
// Usage: node scripts/reupload-template.mjs <storeId> <xlsxPath>

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://deddujcphosetuhqsmpz.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BUCKET = 'excel-templates'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const SKIP_HEADERS = new Set([
  '日期', '星期', 'POS', 'TWPAY', '扣除後的$', '現場', '實際$',
  '配送(月底結)', '配送月底結', '結果', '營業額', '總', '食材', '耗材', '雜項',
])

function parseVendorGroups(ws, headerRowNum) {
  const groupRowNum = headerRowNum - 2
  if (groupRowNum < 1) return {}

  const itemCols = new Set()
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (t && !SKIP_HEADERS.has(t) && !/^\d/.test(t) && t.length <= 15) {
      itemCols.add(colNum)
    }
  })
  if (itemCols.size === 0) return {}
  const minItemCol = Math.min(...itemCols)

  const groupStarts = []
  ws.getRow(groupRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (colNum < minItemCol) return
    if (cell.value instanceof Date) return
    const t = cell.text?.trim()
    if (t && !/^\d/.test(t) && t.length >= 1 && t.length <= 20) {
      groupStarts.push({ col: colNum, name: t })
    }
  })
  if (groupStarts.length === 0) return {}

  const result = {}
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (!itemCols.has(colNum)) return
    const itemName = cell.text?.trim()
    if (!itemName) return
    let group = ''
    for (const gs of groupStarts) {
      if (gs.col <= colNum) group = gs.name
    }
    if (group) result[itemName] = group
  })
  return result
}

function parseColumns(ws) {
  let headerRowNum = -1
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRowNum = r; break }
  }
  if (headerRowNum < 0) return null

  const row = ws.getRow(headerRowNum)
  let miscSubCol = -1, foodSubCol = -1, packSubCol = -1
  row.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (t === '食材') foodSubCol = colNum
    if (t === '耗材') packSubCol = colNum
    if (t === '雜項') miscSubCol = colNum
  })
  if (miscSubCol < 0) return null

  const itemsStartCol = miscSubCol + 1
  const allItems = []
  row.eachCell({ includeEmpty: false }, (cell, colNum) => {
    if (colNum >= itemsStartCol) {
      const name = cell.text?.trim()
      if (name) allItems.push({ name, col: colNum })
    }
  })
  if (allItems.length === 0) return null

  const foodSet = new Set(['高麗菜','大白','蚵白','小白菜','大陸妹','芹菜','韭菜','豆芽','玉米','豆皮','油豆腐','雞蛋','米','油'])
  const packSet = new Set(['杯','碗','袋','外帶袋','筷子','湯匙','吸管','牛皮紙袋','免洗碗','免洗杯'])
  const miscSet = new Set()

  const assigned = allItems.map(({ name }) => {
    if (foodSet.has(name)) return 'food'
    if (packSet.has(name)) return 'pack'
    if (miscSet.has(name)) return 'misc'
    return null
  })

  const firstPackIdx = assigned.findIndex(a => a === 'pack')
  const firstMiscIdx = assigned.findIndex(a => a === 'misc')
  const lastFoodIdx = assigned.reduce((last, a, i) => a === 'food' ? i : last, -1)
  const lastPackIdx = assigned.reduce((last, a, i) => a === 'pack' ? i : last, -1)

  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i] !== null) continue
    if (firstPackIdx >= 0 && i < firstPackIdx) assigned[i] = 'food'
    else if (firstMiscIdx >= 0 && lastPackIdx >= 0 && i > lastFoodIdx && i < firstMiscIdx) assigned[i] = 'pack'
    else if (firstMiscIdx >= 0 && i > lastPackIdx) assigned[i] = 'misc'
    else assigned[i] = firstPackIdx < 0 ? 'food' : (firstMiscIdx < 0 ? 'pack' : 'misc')
  }

  return {
    食材: allItems.filter((_, i) => assigned[i] === 'food').map(x => x.name),
    耗材: allItems.filter((_, i) => assigned[i] === 'pack').map(x => x.name),
    雜項: allItems.filter((_, i) => assigned[i] === 'misc').map(x => x.name),
    headerRowNum,
    ws,
  }
}

async function main() {
  const [,, storeId, xlsxPath] = process.argv
  if (!storeId || !xlsxPath) {
    console.error('Usage: node scripts/reupload-template.mjs <storeId> <xlsxPath>')
    process.exit(1)
  }

  console.log(`Store: ${storeId}`)
  console.log(`File: ${xlsxPath}`)

  const fileBuffer = readFileSync(xlsxPath)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(fileBuffer)

  // Upload xlsx
  const { error: xlsxErr } = await admin.storage.from(BUCKET).upload(
    `${storeId}.xlsx`, fileBuffer, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  )
  if (xlsxErr) { console.error('xlsx upload error:', xlsxErr); process.exit(1) }
  console.log('✓ xlsx uploaded')

  // Parse columns
  let columns = null
  let headerRowNum = -1
  let wsUsed = null
  for (const ws of wb.worksheets) {
    const result = parseColumns(ws)
    if (result) {
      wsUsed = result.ws
      headerRowNum = result.headerRowNum
      columns = { 食材: result.食材, 耗材: result.耗材, 雜項: result.雜項 }
      break
    }
  }

  if (!columns) {
    // fallback: find header row manually
    for (const ws of wb.worksheets) {
      for (let r = 1; r <= 10; r++) {
        if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') {
          wsUsed = ws
          headerRowNum = r
          break
        }
      }
      if (wsUsed) break
    }
  }

  if (!wsUsed || headerRowNum < 0) {
    console.error('Could not find header row in Excel')
    process.exit(1)
  }

  // Parse vendor groups
  const vendorGroupMap = parseVendorGroups(wsUsed, headerRowNum)
  console.log('Vendor groups found:', JSON.stringify(vendorGroupMap))

  if (columns) {
    const colBuf = Buffer.from(JSON.stringify(columns))
    await admin.storage.from(BUCKET).upload(`${storeId}-columns.json`, colBuf, { upsert: true, contentType: 'application/json' })
    console.log('✓ columns.json uploaded')
  }

  // Upload meta
  const meta = { filename: xlsxPath.split('/').pop(), uploadedAt: new Date().toISOString() }
  await admin.storage.from(BUCKET).upload(
    `${storeId}-meta.json`, Buffer.from(JSON.stringify(meta)), { upsert: true, contentType: 'application/json' }
  )
  console.log('✓ meta.json uploaded')

  // Update vendor_group for existing mappings
  if (Object.keys(vendorGroupMap).length > 0) {
    const { data: existing } = await admin.from('item_column_mappings')
      .select('item_name').eq('store_id', storeId)

    console.log(`Found ${existing?.length ?? 0} existing mappings for this store`)

    let updated = 0
    for (const [itemName, group] of Object.entries(vendorGroupMap)) {
      const match = (existing ?? []).find(m => m.item_name === itemName)
      if (match) {
        const { error } = await admin.from('item_column_mappings')
          .update({ vendor_group: group })
          .eq('item_name', itemName).eq('store_id', storeId)
        if (!error) updated++
      }
    }
    console.log(`✓ Updated vendor_group for ${updated} existing mappings`)
  }

  console.log('Done!')
}

main().catch(e => { console.error(e); process.exit(1) })
