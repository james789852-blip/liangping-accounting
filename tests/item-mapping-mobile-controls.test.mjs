import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')

test('品項管理以分類內上下箭頭排序，不再使用拖曳元件', () => {
  assert.doesNotMatch(source, /@dnd-kit/)
  assert.match(source, /const \[sortModeVg, setSortModeVg\]/)
  assert.match(source, /onMoveUp=\{\(\) => moveItem\(vg, idx, 'up'\)\}/)
  assert.match(source, /onMoveDown=\{\(\) => moveItem\(vg, idx, 'down'\)\}/)
  assert.match(source, /aria-label=\{`\$\{displayName\(m\)\}上移`\}/)
  assert.match(source, /aria-label=\{`\$\{displayName\(m\)\}下移`\}/)
})

test('每個分類在加品項旁提供排序與選取功能', () => {
  assert.match(source, /setSortModeVg\(current => current === vg \? null : vg\)/)
  assert.match(source, /setSelectModeVg\(closing \? null : vg\)/)
  assert.match(source, /排序「\$\{vg\}」內的品項/)
  assert.match(source, /選取「\$\{vg\}」內的品項/)
  assert.match(source, /新增品項到「\$\{vg\}」/)
})

test('分類內新增品項成功後會收合表單並清空欄位', () => {
  assert.match(source, /toast\.success\(`已加「\$\{name\}」到「\$\{vg\}」`\)[\s\S]*?setInlineAddVg\(null\)[\s\S]*?setInlineAddName\(''\)[\s\S]*?router\.refresh\(\)/)
})
