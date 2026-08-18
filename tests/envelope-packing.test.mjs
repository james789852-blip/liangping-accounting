import assert from 'node:assert/strict'
import test from 'node:test'

import { getEnvelopePackingState } from '../lib/envelope-packing.ts'

test('正數匯款就是最終裝袋金額並要求照片', () => {
  const result = getEnvelopePackingState({
    remitToHQ: 44_019,
    actualRemit: 72_100,
    adjustmentTotal: -3_043,
    totalReserved: 25_038,
    preReservedExpenseTotal: 0,
  })

  assert.equal(result.amount, 44_019)
  assert.equal(result.shortfall, 0)
  assert.equal(result.requiresPhoto, true)
})

test('負數匯款不會顯示成負數信封，改列待處理差額', () => {
  const result = getEnvelopePackingState({
    remitToHQ: -35_000,
    actualRemit: 0,
    adjustmentTotal: 0,
    totalReserved: 35_000,
    preReservedExpenseTotal: 0,
  })

  assert.equal(result.amount, 0)
  assert.equal(result.shortfall, 35_000)
  assert.equal(result.requiresPhoto, false)
})

test('預留與匯款調整的組成改變時確認簽章會失效', () => {
  const first = getEnvelopePackingState({
    remitToHQ: 80_000,
    actualRemit: 100_000,
    adjustmentTotal: -10_000,
    totalReserved: 10_000,
    preReservedExpenseTotal: 0,
  })
  const second = getEnvelopePackingState({
    remitToHQ: 80_000,
    actualRemit: 100_000,
    adjustmentTotal: -20_000,
    totalReserved: 0,
    preReservedExpenseTotal: 0,
  })

  assert.notEqual(first.signature, second.signature)
})
