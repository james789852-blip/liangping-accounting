import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isIsoBusinessDate,
  isReceiptDateLocked,
  lockedReceiptMessage,
} from '../lib/receipt-guards.ts'

test('submitted and verified closing dates lock receipts', () => {
  assert.equal(isReceiptDateLocked('submitted'), true)
  assert.equal(isReceiptDateLocked('verified'), true)
  assert.equal(isReceiptDateLocked('draft'), false)
  assert.equal(isReceiptDateLocked('disputed'), false)
  assert.equal(isReceiptDateLocked(null), false)
})

test('locked receipt messages explain the required workflow', () => {
  assert.match(lockedReceiptMessage('submitted') ?? '', /退回修改/)
  assert.match(lockedReceiptMessage('verified') ?? '', /總公司退回/)
  assert.equal(lockedReceiptMessage('draft'), null)
})

test('business date validation rejects impossible or ambiguous dates', () => {
  assert.equal(isIsoBusinessDate('2026-08-14'), true)
  assert.equal(isIsoBusinessDate('2026-02-29'), false)
  assert.equal(isIsoBusinessDate('2024-02-29'), true)
  assert.equal(isIsoBusinessDate('2026/08/14'), false)
  assert.equal(isIsoBusinessDate('not-a-date'), false)
})
