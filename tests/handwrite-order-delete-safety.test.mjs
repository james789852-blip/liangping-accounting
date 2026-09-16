import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')

test('手寫單號第一次點刪除只開啟確認區，不會立即移除資料', () => {
  assert.match(source, /const \[pendingHandwriteDeleteId, setPendingHandwriteDeleteId\] = useState<string \| null>\(null\)/)
  assert.match(source, /onClick=\{\(\) => setPendingHandwriteDeleteId\(o\.id\)\}[\s\S]*?刪除此筆（需再次確認）/)
  assert.match(source, /pendingHandwriteDeleteId === o\.id[\s\S]*?確定刪除單號 \{o\.order_number\}/)
})

test('只有確認刪除按鈕才會移除單號，且確認狀態會自動取消', () => {
  assert.match(source, /window\.setTimeout\(\(\) => setPendingHandwriteDeleteId\(null\), 8000\)/)
  assert.match(source, /onClick=\{\(\) => removeHandwriteOrder\(o\.id\)\}[\s\S]*?確認刪除/)
  assert.match(source, /setPendingHandwriteDeleteId\(null\)[\s\S]*?scheduleBackgroundSave\(\)/)
})

test('單筆刪除控制使用放大的垃圾桶按鈕並標示目標單號', () => {
  assert.match(source, /className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"/)
  assert.match(source, /aria-label=\{`準備刪除單號 \$\{o\.order_number\}`\}/)
  assert.match(source, /<Trash2 className="h-4 w-4" \/>/)
})
