import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPreReservedExpenseHints,
  getPreReservedExpenseDetails,
  getPreReservedExpenseTotal,
} from '../lib/pre-reserved-expenses.ts'

test('類別文字包含且金額相同時，舊資料會自動建立固定連結', () => {
  const result = applyPreReservedExpenseHints(
    [{ id: 'expense', description: '7–8 月營業稅', amount: 90_486 }],
    [{ reason: '營業稅', amount: 90_486, reference_id: 'tax-2026-09' }],
  )

  assert.deepEqual(result, [{
    id: 'expense',
    description: '7–8 月營業稅',
    amount: 90_486,
    preReserved: true,
    preReservedAmount: 90_486,
    reserveReferenceId: 'tax-2026-09',
    reserveReason: '營業稅',
  }])
})

test('總公司信封袋結算會逐筆顯示預留款加回的支出名稱與金額', () => {
  const cashCounts = [{
    large_expenses: [
      { description: '房租', amount: 77_000, preReserved: true, preReservedAmount: 77_000 },
      { description: '營業稅', amount: 30_000, pre_reserved: true, pre_reserved_amount: 20_000 },
      { description: '一般支出', amount: 500, preReserved: false },
    ],
  }]

  assert.deepEqual(getPreReservedExpenseDetails(cashCounts), [
    { description: '房租', amount: 77_000 },
    { description: '營業稅', amount: 20_000 },
  ])
  assert.equal(getPreReservedExpenseTotal(cashCounts), 97_000)
})

test('同時有兩筆候選預留款時不做猜測', () => {
  const item = { id: 'expense', description: '營業稅', amount: 90_486 }
  const result = applyPreReservedExpenseHints([item], [
    { reason: '營業稅', amount: 90_486, reference_id: 'tax-a' },
    { reason: '營業稅', amount: 90_486, reference_id: 'tax-b' },
  ])

  assert.deepEqual(result, [item])
})

test('明確指定預留款後不依賴支出名稱，且只加回已預留金額', () => {
  const result = applyPreReservedExpenseHints(
    [{
      id: 'expense',
      description: '完全不同的帳單名稱',
      amount: 30_000,
      reserveReferenceId: 'rent-a',
    }],
    [{ reason: '房租', amount: 20_000, total_bill: 30_000, reference_id: 'rent-a' }],
  )

  assert.equal(result[0].preReserved, true)
  assert.equal(result[0].preReservedAmount, 20_000)
  assert.equal(getPreReservedExpenseTotal(result), 20_000)
  assert.strictEqual(applyPreReservedExpenseHints(result, [
    { reason: '房租', amount: 20_000, total_bill: 30_000, reference_id: 'rent-a' },
  ])[0], result[0])
})
