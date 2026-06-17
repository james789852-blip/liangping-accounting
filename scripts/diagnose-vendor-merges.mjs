// 診斷各店模板的合併儲存格範圍，找出 退稅 是否延伸太寬
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

const TARGET_ITEMS = ['天然氣', '瓦斯', '水費', '電費', '電話費', '垃圾費', '廚餘費', '保險費', '房租', '稅金', '獎金', '體檢費用']

const { data: stores } = await admin.from('stores').select('id, name').eq('active', true).neq('type', '央廚')
for (const store of stores ?? []) {
  console.log(`\n=== ${store.name} (${store.id}) ===`)
  const { data: file } = await admin.storage.from('excel-templates').download(`${store.id}.xlsx`)
  if (!file) { console.log('  無模板'); continue }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()))
  const ws = wb.worksheets.find(s => s.name.includes('食耗')) ?? wb.worksheets[0]
  if (!ws) { console.log('  找不到工作表'); continue }

  // 找 headerRow
  let headerRow = -1
  for (let r = 1; r <= 10; r++) {
    if (ws.getRow(r).getCell(1).text?.replace(/[\s　]/g, '') === '日期') { headerRow = r; break }
  }
  if (headerRow < 3) { console.log(`  headerRow=${headerRow}，跳過`); continue }

  const merges = ws.model?.merges ?? []
  const vendorRow = headerRow - 2

  // 找含 "退稅" 的合併儲存格
  const taxMerges = []
  for (const m of merges) {
    const [start, end] = m.split(':')
    const s = a1ToRC(start)
    const e = a1ToRC(end)
    if (s.r <= vendorRow && e.r >= vendorRow) {
      const text = ws.getRow(vendorRow).getCell(s.c).text?.trim()
      if (text === '退稅' || text === '稅金') {
        const spanCols = e.c - s.c + 1
        taxMerges.push({ range: m, text, startCol: s.c, endCol: e.c, spanCols })
      }
    }
  }

  // 對每個目標 item，找它的 column 位置與 row 1 的內容
  const itemFindings = []
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNum) => {
    const t = cell.text?.trim()
    if (!t || !TARGET_ITEMS.includes(t)) return
    // 看 row 1 的有效文字（含合併）
    let row1Text = ''
    for (const m of merges) {
      const [start, end] = m.split(':')
      const s = a1ToRC(start)
      const e = a1ToRC(end)
      if (s.r <= vendorRow && e.r >= vendorRow && s.c <= colNum && e.c >= colNum) {
        row1Text = ws.getRow(vendorRow).getCell(s.c).text?.trim() ?? ''
        break
      }
    }
    if (!row1Text) row1Text = ws.getRow(vendorRow).getCell(colNum).text?.trim() ?? ''
    itemFindings.push({ col: colToLetter(colNum), item: t, row1: row1Text || '(空)' })
  })

  if (taxMerges.length) {
    console.log('  退稅合併儲存格：')
    for (const tm of taxMerges) {
      console.log(`    ${tm.range} (${tm.text}, 跨 ${tm.spanCols} 欄: ${colToLetter(tm.startCol)}~${colToLetter(tm.endCol)})`)
    }
  } else {
    console.log('  無含退稅的合併儲存格')
  }
  if (itemFindings.length) {
    console.log('  目標品項偵測：')
    for (const f of itemFindings) {
      const flag = f.row1 === '(空)' ? '  ✓未分類' : `  ⚠ 會歸到「${f.row1}」`
      console.log(`    ${f.col}  ${f.item.padEnd(6)}  row1=${f.row1.padEnd(8)}${flag}`)
    }
  }
}

console.log('\n完成')
