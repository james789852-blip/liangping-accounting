import assert from 'node:assert/strict'
import test from 'node:test'

import { isNegativeItem, normalizeItemAmount } from '../lib/negative-items.ts'

test('賣東西給分店會固定以負數儲存與統計', () => {
  assert.equal(isNegativeItem('賣東西給分店'), true)
  assert.equal(normalizeItemAmount('賣東西給分店', 650), -650)
  assert.equal(normalizeItemAmount('賣東西給分店', -650), -650)
})

test('一般買東西或維修品項維持原本金額', () => {
  assert.equal(normalizeItemAmount('與分店買東西', 650), 650)
  assert.equal(normalizeItemAmount('冷氣維修', 1200), 1200)
})
