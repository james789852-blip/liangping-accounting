// 對指定店家（預設所有店）依模板的合併儲存格 + 兩列邏輯重建 vendor_group
// 不重新插入新 mapping，只更新既有 mapping 的 vendor_group / item_category
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

const DOC_TYPE_PATTERNS = ['發票', '收據', '估價單', '公司開']

// 與 excel-template/route.ts 一致：不要把這些系統欄誤當品項
const SKIP_HEADERS = new Set([
  '日期', '星期', 'POS', 'TWPAY', '扣除後的$', '現場', '實際$',
  '配送(月底結)', '配送月底結', '結果', '營業額', '總', '食材', '耗材', '雜項',
  '(手動)POS', '(手動)實際$', '線上點餐', '線上點餐(現金)', '日　期',
])
// 渠道、店名、其他不是品項的欄位
const SKIP_CHANNELS = new Set([
  '熊貓', 'panda', 'foodpanda', 'Taiwan pay', 'taiwan pay', 'TWPay', 'TWPAY',
  'NFT', 'PAY', 'pay', 'Uber', 'uber', '線上', '線上點餐',
  '心惦', '大直', '北安', '鑫耀鑫', '巷日', '福城', '鑫營', '梁鑫', '幸福', '景新', '府中',
  '配送(月結)', '配送月結', '配送',
])
const skipHeader = (t) => {
  const norm = t.replace(/[\s　]/g, '')
  if (SKIP_HEADERS.has(t) || SKIP_HEADERS.has(norm)) return true
  if (SKIP_CHANNELS.has(t) || SKIP_CHANNELS.has(norm)) return true
  if (norm.includes('手動')) return true
  if (/^\d/.test(norm)) return true
  if (norm.length > 15) return true
  return false
}

// 不要把這些群組名誤當 vendor（它們是 row 1 出現的特殊文字，但實際是 subtotal/summary）
const SKIP_VENDOR_GROUPS = new Set(['梁平退稅', '總發票', '總收據', '總'])

function readRowByMerge(ws, rowNum, merges, maxCol) {
  const colToMaster = new Map()
  for (const m of merges) {
    const [start, end] = m.split(':')
    const s = a1ToRC(start), e = a1ToRC(end)
    if (s.r <= rowNum && e.r >= rowNum) {
      for (let c = s.c; c <= e.c; c++) colToMaster.set(c, s.c)
    }
  }
  const result = []
  for (let c = 1; c <= maxCol; c++) {
    const src = colToMaster.get(c) ?? c
    result[c] = ws.getRow(rowNum).getCell(src).text?.trim() ?? ''
  }
  return result
}

const TARGET_STORE = process.argv[2] // 可指定店名；不給則全部跑

const { data: storesAll } = await admin.from('stores').select('id, name, type, active').eq('active', true).neq('type', '央廚')
const stores = TARGET_STORE ? storesAll.filter(s => s.name === TARGET_STORE) : storesAll

for (const store of stores ?? []) {
  console.log(`\n=== ${store.name} (${store.id}) ===`)
  const { data: file } = await admin.storage.from('excel-templates').download(`${store.id}.xlsx`)
  if (!file) { console.log('  無模板，跳過'); continue }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()))
  const ws = wb.worksheets.find(s => s.name.includes('食耗')) ?? wb.worksheets[0]
  if (!ws) { console.log('  找不到工作表'); continue }

  let headerRow = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRow = r; break }
  }
  if (headerRow < 3) { console.log(`  headerRow=${headerRow}，跳過`); continue }

  const merges = ws.model?.merges ?? []
  const maxCol = Math.max((ws.columnCount || 0) + 5, 100)
  const vendorTexts = readRowByMerge(ws, headerRow - 2, merges, maxCol)
  const docTexts = readRowByMerge(ws, headerRow - 1, merges, maxCol)

  // 取得 row1→row2→未分類 的群組（map: col → group | null）
  const colGroup = {}
  const valid = (t) => t && !/^\d/.test(t) && t.length <= 20
  for (let c = 1; c <= maxCol; c++) {
    const v = vendorTexts[c] ?? ''
    if (valid(v)) { colGroup[c] = v; continue }
    const d = docTexts[c] ?? ''
    if (valid(d) && DOC_TYPE_PATTERNS.some(p => d.includes(p))) {
      colGroup[c] = d
      continue
    }
    colGroup[c] = null // 未分類
  }

  // 掃描 row 3 取得每個 column 的品項名稱（跳過系統欄）
  const itemsByCol = []
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t || skipHeader(t)) return
    let group = colGroup[colNum]
    if (group && SKIP_VENDOR_GROUPS.has(group)) group = null
    itemsByCol.push({ col: colNum, name: t, group })
  })

  // 依品項名稱統計出現次數 → 多 group 則需要 prefix
  const nameCount = {}
  for (const x of itemsByCol) nameCount[x.name] = (nameCount[x.name] || 0) + 1

  // 為每個 column 推導 itemName（與 POST handler 邏輯一致）
  const seenCombo = {}
  const desiredByItemName = new Map() // itemName → group
  for (const x of itemsByCol) {
    const vgForKey = x.group
    const comboKey = `${x.name}|${vgForKey ?? ''}`
    const occ = (seenCombo[comboKey] || 0) + 1
    seenCombo[comboKey] = occ
    let itemName
    if (occ === 1) itemName = (nameCount[x.name] > 1 && vgForKey) ? `${vgForKey}${x.name}` : x.name
    else itemName = vgForKey ? `${vgForKey}${x.name}${occ}` : `${x.name}${occ}`
    desiredByItemName.set(itemName, vgForKey)
  }

  // 撈 DB 內所有店家自訂 mapping
  const { data: dbMaps } = await admin.from('item_column_mappings')
    .select('id, item_name, vendor_group, item_category, excel_column')
    .eq('store_id', store.id)

  const dbByName = new Map((dbMaps ?? []).map(m => [m.item_name, m]))

  // 用 desiredByItemName + 對應的 baseName / category 來決定模板 truth
  const seenCombo2 = {}
  const truthList = []
  for (const x of itemsByCol) {
    const vgForKey = x.group
    const comboKey = `${x.name}|${vgForKey ?? ''}`
    const occ = (seenCombo2[comboKey] || 0) + 1
    seenCombo2[comboKey] = occ
    let itemName
    if (occ === 1) itemName = (nameCount[x.name] > 1 && vgForKey) ? `${vgForKey}${x.name}` : x.name
    else itemName = vgForKey ? `${vgForKey}${x.name}${occ}` : `${x.name}${occ}`
    truthList.push({ itemName, excelCol: x.name, vendorGroup: vgForKey })
  }

  let updated = 0, unchanged = 0, inserted = 0, fail = 0
  for (const t of truthList) {
    const existing = dbByName.get(t.itemName)
    if (!existing) {
      // 全域是否已涵蓋？（store_id IS NULL）若有則不插
      const { data: globalCheck } = await admin.from('item_column_mappings')
        .select('id').is('store_id', null).eq('item_name', t.itemName).limit(1)
      if (globalCheck?.length) continue
      // 推測 category：依 vendor group 名稱（食材/耗材簡單規則）
      let cat = '雜項'
      if (['菜商', '豬肉商', '雞蛋', '滷蛋', '油豆腐', '豆腐商', '振源', '小雲', '上逸', '佑康', '央廚配送'].some(k => t.vendorGroup?.includes(k))) cat = '食材'
      else if (['免洗', '雜貨', 'Duskin'].some(k => t.vendorGroup?.includes(k))) cat = '耗材'
      const { error } = await admin.from('item_column_mappings').insert({
        item_name: t.itemName, excel_column: t.excelCol, item_category: cat,
        vendor_group: t.vendorGroup, store_id: store.id, updated_at: new Date().toISOString(),
      })
      if (error) { console.error(`  ✗ insert ${t.itemName}: ${error.message}`); fail++ }
      else { inserted++; console.log(`  + ${t.itemName.padEnd(12)} → col=${t.excelCol.padEnd(8)} vg=${t.vendorGroup ?? '(null)'}`) }
      continue
    }
    const needsVg = (existing.vendor_group ?? null) !== (t.vendorGroup ?? null)
    const needsCol = existing.excel_column !== t.excelCol
    if (!needsVg && !needsCol) { unchanged++; continue }
    const patch = { updated_at: new Date().toISOString() }
    if (needsVg) patch.vendor_group = t.vendorGroup
    if (needsCol) patch.excel_column = t.excelCol
    const { error } = await admin.from('item_column_mappings').update(patch).eq('id', existing.id)
    if (error) { console.error(`  ✗ update ${t.itemName}: ${error.message}`); fail++ }
    else {
      updated++
      const parts = []
      if (needsVg) parts.push(`vg ${existing.vendor_group ?? '(null)'} → ${t.vendorGroup ?? '(null)'}`)
      if (needsCol) parts.push(`col ${existing.excel_column} → ${t.excelCol}`)
      console.log(`  ✓ ${t.itemName.padEnd(12)} ${parts.join(', ')}`)
    }
  }
  console.log(`  小計：插入 ${inserted}、更新 ${updated}、不變 ${unchanged}、失敗 ${fail}`)
}
console.log('\n完成')
