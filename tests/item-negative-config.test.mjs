import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const actions = fs.readFileSync(new URL('../app/actions/item-mappings.ts', import.meta.url), 'utf8')
const receiptActions = fs.readFileSync(new URL('../app/actions/receipts.ts', import.meta.url), 'utf8')
const managerUI = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')
const closingUI = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
const mappingSource = fs.readFileSync(new URL('../lib/mapping-based-items.ts', import.meta.url), 'utf8')

test('品項管理可切換店面負數，並明確保留歷史帳目', () => {
  assert.match(actions, /export async function setItemNegativeFlag/)
  assert.match(actions, /historical_amounts_preserved: true/)
  assert.match(managerUI, /NegativeToggle/)
  assert.match(managerUI, /歷史帳目不變/)
})

test('店面新增與編輯收據都由伺服器再次強制負數', () => {
  assert.match(receiptActions, /getNegativeItemMappingIds/)
  assert.match(receiptActions, /negativeMappingIds\.has/)
  assert.match(closingUI, /自動轉負/)
})

test('分類同名的其他可轉成正式品項並傳到店面表單', () => {
  assert.match(actions, /recordMappingExplicitItem/)
  assert.match(actions, /convertedPlaceholder/)
  assert.match(mappingSource, /is_explicit_item: isExplicitItemFromStatusEvents/)
})
