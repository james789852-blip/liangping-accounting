import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function colToLetter(n) {
  let s = ''
  while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26) }
  return s
}
function a1ToRC(a1) {
  const m = a1.match(/^\$?([A-Z]+)\$?(\d+)$/)
  if (!m) return { r: 1, c: 1 }
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: parseInt(m[2]), c }
}

const { data: stores } = await admin.from('stores').select('id, name')
const store = stores?.find(s => s.name === '巷日')
if (!store) { console.log('找不到 巷日'); process.exit(1) }
console.log('巷日 storeId:', store.id)

// 1. 下載模板，分析合併與 row 1/2 內容
const { data: file } = await admin.storage.from('excel-templates').download(`${store.id}.xlsx`)
if (!file) { console.log('無模板'); process.exit(1) }
const wb = new ExcelJS.Workbook()
await wb.xlsx.load(Buffer.from(await file.arrayBuffer()))
const ws = wb.worksheets.find(s => s.name.includes('食耗')) ?? wb.worksheets[0]
console.log('工作表名稱：', ws.name)

let headerRow = -1
for (let r = 1; r <= 10; r++) {
  if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRow = r; break }
}
console.log('headerRow:', headerRow)

const merges = ws.model?.merges ?? []
console.log('\n所有合併儲存格（共', merges.length, '個）：')
for (const m of merges.slice(0, 30)) {
  const [s, e] = m.split(':')
  const sP = a1ToRC(s), eP = a1ToRC(e)
  const text = ws.getRow(sP.r).getCell(sP.c).text?.trim() ?? ''
  console.log(`  ${m}  → row ${sP.r}, col ${colToLetter(sP.c)}~${colToLetter(eP.c)}: "${text}"`)
}
if (merges.length > 30) console.log(`  ... 還有 ${merges.length - 30} 個`)

// 印出 row 1, row 2 的內容（A 到 BZ）
const vendorRow = headerRow - 2
const docRow = headerRow - 1
console.log(`\nRow ${vendorRow} (vendor) 與 Row ${docRow} (docType) 內容：`)

// 建立 col → master col 的映射（針對 vendorRow 與 docRow）
const buildMerge = (row) => {
  const map = new Map()
  for (const m of merges) {
    const [s, e] = m.split(':')
    const sP = a1ToRC(s), eP = a1ToRC(e)
    if (sP.r <= row && eP.r >= row) {
      for (let c = sP.c; c <= eP.c; c++) map.set(c, sP.c)
    }
  }
  return map
}
const vMap = buildMerge(vendorRow)
const dMap = buildMerge(docRow)

for (let c = 1; c <= 80; c++) {
  const vMaster = vMap.get(c) ?? c
  const dMaster = dMap.get(c) ?? c
  const vText = ws.getRow(vendorRow).getCell(vMaster).text?.trim() ?? ''
  const dText = ws.getRow(docRow).getCell(dMaster).text?.trim() ?? ''
  const hText = ws.getRow(headerRow).getCell(c).text?.trim() ?? ''
  if (!vText && !dText && !hText) continue
  const isMaster = (vMap.get(c) ?? c) === c
  const flag = vMap.has(c) ? (isMaster ? ' [合併主]' : ' [合併]') : ''
  console.log(`  ${colToLetter(c).padEnd(3)} | vendor="${vText.padEnd(6)}" | doc="${dText.padEnd(6)}" | item="${hText.padEnd(8)}"${flag}`)
}

// 2. 看 DB 內這些品項目前的 vendor_group
const TARGET = ['魚丸', '芹菜', '高麗菜', '蚵白', '油菜', '空心菜', '大白菜', '雜項']
const { data: mappings } = await admin
  .from('item_column_mappings')
  .select('item_name, excel_column, vendor_group, item_category')
  .eq('store_id', store.id)
  .in('item_name', TARGET)

console.log('\nDB 內目標品項的對應：')
for (const m of mappings ?? []) {
  console.log(`  ${m.item_name.padEnd(6)} → col=${m.excel_column.padEnd(6)} cat=${m.item_category.padEnd(4)} vg=${m.vendor_group ?? '(null=未分類)'}`)
}
