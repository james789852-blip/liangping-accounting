import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const actions = fs.readFileSync(new URL('../app/actions/item-mappings.ts', import.meta.url), 'utf8')
const receiptActions = fs.readFileSync(new URL('../app/actions/receipts.ts', import.meta.url), 'utf8')
const managerUI = fs.readFileSync(new URL('../components/hq/item-mappings-client.tsx', import.meta.url), 'utf8')
const closingUI = fs.readFileSync(new URL('../components/manager/closing-form.tsx', import.meta.url), 'utf8')
const mappingSource = fs.readFileSync(new URL('../lib/mapping-based-items.ts', import.meta.url), 'utf8')

test('品項管理可切換固定正數、固定負數與每筆正負，並明確保留歷史帳目', () => {
  assert.match(actions, /export async function setItemSignMode/)
  assert.match(actions, /historical_amounts_preserved: true/)
  assert.match(managerUI, /SignModeControl/)
  assert.match(managerUI, /固定正數/)
  assert.match(managerUI, /固定負數/)
  assert.match(managerUI, /每筆正負/)
  assert.match(managerUI, /歷史帳目不變/)
})

test('既有賣給分店與其他品項在管理頁沿用原本正負規則', () => {
  assert.match(managerUI, /systemFixedNegative=\{isNegativeItem\(m\.item_name\)\}/)
  assert.match(managerUI, /m\.store_type !== '央廚'/)
  assert.match(mappingSource, /defaultItemSignMode/)
  assert.match(mappingSource, /signModeFromStatusEvents/)
})

test('店面新增與編輯收據都由伺服器再次強制負數', () => {
  assert.match(receiptActions, /getNegativeItemMappingIds/)
  assert.match(receiptActions, /negativeMappingIds\.has/)
  assert.match(closingUI, /自動轉負/)
  assert.match(closingUI, /configuredFlexibleReceiptItem/)
  assert.match(closingUI, /改為負數/)
})

test('店面直接輸入類別會依品項管理設定即時轉換整張單據金額', () => {
  assert.match(closingUI, /function receiptItemSignMode/)
  assert.match(closingUI, /mapping\?\.sign_mode === 'negative'/)
  assert.match(closingUI, /total_amount: normalizeReceiptAmountForSignMode\(f\.total_amount, signMode\)/)
  assert.match(closingUI, /setEditAmount\(value => normalizeReceiptAmountForSignMode\(value, signMode\)\)/)
  assert.match(closingUI, /固定負數・輸入後自動轉負/)
  assert.match(closingUI, /if \(receiptFormForcesNegativeTotal\(form, mappingColumns\)\) return amount < 0/)
})

test('分類同名的其他可轉成正式品項並傳到店面表單', () => {
  assert.match(actions, /recordMappingExplicitItem/)
  assert.match(actions, /convertedPlaceholder/)
  assert.match(mappingSource, /is_explicit_item: isExplicitItemFromStatusEvents/)
})
