import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')

test('手寫單號第一次點刪除只開啟確認區，不會立即移除資料', () => {
  assert.match(source, /const \[pendingHandwriteDeleteId, setPendingHandwriteDeleteId\] = useState<string \| null>\(null\)/)
  assert.match(source, /onClick=\{\(\) => \{ setPendingHandwriteDeleteId\(o\.id\); setPendingHandwriteVoidId\(null\) \}\}[\s\S]*?刪除此筆（需再次確認）/)
  assert.match(source, /pendingHandwriteDeleteId === o\.id[\s\S]*?確定刪除單號 \{o\.order_number\}/)
})

test('只有確認刪除按鈕才會移除單號，且確認狀態會自動取消', () => {
  assert.match(source, /window\.setTimeout\(\(\) => setPendingHandwriteDeleteId\(null\), 8000\)/)
  assert.match(source, /onClick=\{\(\) => removeHandwriteOrder\(o\.id\)\}[\s\S]*?確認刪除/)
  assert.match(source, /setPendingHandwriteDeleteId\(null\)[\s\S]*?scheduleBackgroundSave\(\)/)
})

test('單筆刪除控制使用放大的垃圾桶按鈕並標示目標單號', () => {
  assert.match(source, /className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"/)
  assert.match(source, /aria-label=\{`準備刪除單號 \$\{o\.order_number\}`\}/)
  assert.match(source, /<Trash2 className="h-4 w-4" \/>/)
})

test('作廢按鈕第一次點擊只開啟確認區，不會立即改變訂單狀態', () => {
  assert.match(source, /const \[pendingHandwriteVoidId, setPendingHandwriteVoidId\] = useState<string \| null>\(null\)/)
  assert.match(source, /onClick=\{\(\) => \{ setPendingHandwriteVoidId\(o\.id\); setPendingHandwriteDeleteId\(null\) \}\}/)
  assert.match(source, /pendingHandwriteVoidId === o\.id[\s\S]*?確定將單號 \$\{o\.order_number\} 標記為作廢/)
  assert.doesNotMatch(source, /onClick=\{\(\) => toggleVoidOrder\(o\.id\)\}/)
})

test('作廢或恢復都需要按下第二次確認並會自動收回確認區', () => {
  assert.match(source, /window\.setTimeout\(\(\) => setPendingHandwriteVoidId\(null\), 8000\)/)
  assert.match(source, /onClick=\{\(\) => confirmToggleVoidOrder\(o\.id\)\}/)
  assert.match(source, /\{o\.voided \? '確認恢復' : '確認作廢'\}/)
  assert.match(source, /setPendingHandwriteVoidId\(null\)[\s\S]*?scheduleBackgroundSave\(\)/)
})

test('手機手寫單號標題、金額與操作欄使用相同網格保持對齊', () => {
  assert.match(source, /whitespace-nowrap text-xs font-bold[\s\S]*?（\{handwriteOrders\.length\} 筆）/)
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_6rem_3\.25rem_2\.5rem\]/)
  assert.match(source, /className="h-10 w-full min-w-0"/)
  assert.match(source, />狀態<\/span>/)
  assert.match(source, /grid grid-cols-\[minmax\(0,1fr\)_auto\] items-center gap-3/)
})

test('批次更換單號預設收合，需要時才展開', () => {
  assert.match(source, /<details className="group mt-3 border-t border-zinc-200 pt-3">/)
  assert.match(source, /<summary[\s\S]*?批次更換單號[\s\S]*?<ChevronDown/)
  assert.match(source, /group-open:rotate-180/)
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:=|>)/)
  assert.match(source, /<details[\s\S]*?aria-label="原單號起始"[\s\S]*?onClick=\{replaceHandwriteOrderRange\}[\s\S]*?<\/details>/)
})
