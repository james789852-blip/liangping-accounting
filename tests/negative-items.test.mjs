import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultItemSignMode, isNegativeItem, normalizeItemAmount } from '../lib/negative-items.ts'

test('賣東西給分店會固定以負數儲存與統計', () => {
  assert.equal(isNegativeItem('賣東西給分店'), true)
  assert.equal(normalizeItemAmount('賣東西給分店', 650), -650)
  assert.equal(normalizeItemAmount('賣東西給分店', -650), -650)
})

test('既有的（賣）給分店食材名稱仍維持固定負數', () => {
  assert.equal(isNegativeItem('（賣）給分店食材'), true)
  assert.equal(isNegativeItem('(賣) 給分店食材'), true)
  assert.equal(normalizeItemAmount('（賣）給分店食材', 800), -800)
  assert.equal(defaultItemSignMode('（賣）給分店食材', '其他'), 'negative')
})

test('其他分類的其他沿用既有每筆正負規則', () => {
  assert.equal(defaultItemSignMode('其他', '其他', true), 'flexible')
  assert.equal(defaultItemSignMode('其他', '其他', false), 'positive')
  assert.equal(defaultItemSignMode('其他', '買東西或維修', true), 'positive')
})

test('一般買東西或維修品項維持原本金額', () => {
  assert.equal(normalizeItemAmount('與分店買東西', 650), 650)
  assert.equal(normalizeItemAmount('冷氣維修', 1200), 1200)
})

test('品項管理啟用負數後，自訂名稱也會固定以負數儲存', () => {
  assert.equal(normalizeItemAmount('其他', 500, true), -500)
  assert.equal(normalizeItemAmount('其他', -500, true), -500)
  assert.equal(normalizeItemAmount('其他', 500, false), 500)
})
