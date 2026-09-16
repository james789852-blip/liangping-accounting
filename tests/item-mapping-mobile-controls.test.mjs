import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')
const actions = fs.readFileSync(new URL('../app/actions/item-mappings.ts', import.meta.url), 'utf8')

test('品項管理以分類內上下箭頭排序，不再使用拖曳元件', () => {
  assert.doesNotMatch(source, /@dnd-kit/)
  assert.match(source, /const \[sortModeVg, setSortModeVg\]/)
  assert.match(source, /onMoveUp=\{\(\) => moveItem\(vg, idx, 'up'\)\}/)
  assert.match(source, /onMoveDown=\{\(\) => moveItem\(vg, idx, 'down'\)\}/)
  assert.match(source, /aria-label=\{`\$\{displayName\(m\)\}上移`\}/)
  assert.match(source, /aria-label=\{`\$\{displayName\(m\)\}下移`\}/)
})

test('排序模式將單據類型與其他控制項分成上下兩列，避免品項名稱被壓縮', () => {
  assert.match(source, /sortMode \? 'min-w-0 flex-1 space-y-2' : 'contents'/)
  assert.match(source, /sortMode \? 'flex min-w-0 items-center gap-2' : 'contents'/)
  assert.match(source, /sortMode \? 'flex min-w-0 flex-wrap items-center gap-1\.5 md:gap-2' : 'contents'/)
  assert.match(source, /sortMode \? 'sm:whitespace-nowrap'/)
})

test('每個分類在加品項旁提供排序與選取功能', () => {
  assert.match(source, /setSortModeVg\(current => current === vg \? null : vg\)/)
  assert.match(source, /setSelectModeVg\(closing \? null : vg\)/)
  assert.match(source, /排序「\$\{vg\}」內的品項/)
  assert.match(source, /選取「\$\{vg\}」內的品項/)
  assert.match(source, /新增品項到「\$\{vg\}」/)
})

test('分類內新增品項成功後就地更新並收合表單，不刷新整頁', () => {
  const start = source.indexOf('const name = inlineAddName.trim()')
  const end = source.indexOf('className="text-xs font-semibold px-3 py-2 rounded-lg text-white"', start)
  const inlineSave = source.slice(start, end)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(inlineSave, /mergeSavedMappings\(\[/)
  assert.match(inlineSave, /toast\.success\(`已加「\$\{name\}」到「\$\{vg\}」`\)[\s\S]*?setInlineAddVg\(null\)[\s\S]*?setInlineAddName\(''\)/)
  assert.doesNotMatch(inlineSave, /router\.refresh\(\)/)
})

test('新增品項 action 回傳完整 mapping，供畫面就地更新', () => {
  assert.match(actions, /\.insert\(\{[\s\S]*?doc_type_override: vendorOnlyDocType,[\s\S]*?\}\)\.select\('\*'\)\.single\(\)/)
  assert.match(actions, /mapping: savedMapping/)
})

test('品項名稱與所有設定只能從編輯區修改，列表本身保持唯讀', () => {
  assert.doesNotMatch(source, /function InlineItemNameEditor/)
  assert.match(source, />品項名稱</)
  assert.match(source, />Excel 對應名稱</)
  assert.match(source, />單據類型</)
  assert.match(source, /title="編輯品項所有設定"/)
  assert.match(source, /editId === m\.id[\s\S]*?value=\{editDocType\}[\s\S]*?setEditRefund[\s\S]*?value=\{editSignMode\}[\s\S]*?setEditTaxAddon/)
  assert.match(source, /await setItemDocOverride[\s\S]*?await setItemRefundFlag[\s\S]*?await setItemSignMode[\s\S]*?await setItemTaxAddonFlag/)
})

test('品項編輯區使用對齊網格與獨立帳務設定卡片', () => {
  assert.match(source, />編輯品項設定</)
  assert.match(source, /所有欄位只會在按下儲存後套用/)
  assert.match(source, /grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4/)
  assert.match(source, /grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4/)
  assert.match(source, /min-h-\[124px\][\s\S]*?>單據類型<[\s\S]*?>退稅設定<[\s\S]*?>金額正負<[\s\S]*?>稅外加設定</)
  assert.match(source, /flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end/)
})

test('單筆刪除會一次完成安全停用與封存，列表立即移除', () => {
  assert.match(source, /const disableResult = await deleteItemMapping\(id\)[\s\S]*?const archiveResult = await archiveItemMapping\(id\)/)
  assert.match(source, /archived: true/)
  assert.match(source, /aria-label="刪除品項"/)
})
