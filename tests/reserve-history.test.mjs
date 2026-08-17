import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReserveHistoryContext } from '../lib/reserve-history.ts'

test('後續日期的同名足額支出會核銷歷史預留款提醒', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-08-15',
      reserve_items: [],
      expense_items: [{ description: '房租', amount: 90_000 }],
    },
    {
      business_date: '2026-08-13',
      reserve_items: [{ reason: '房租', amount: 22_170 }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result, {
    prevDayReserves: null,
    preReservedExpenseHints: [],
  })
})

test('尚未出現對應支出時仍保留預留款提醒', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-08-13',
      reserve_items: [{ reason: '房租', amount: 22_170 }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result.preReservedExpenseHints, [{ reason: '房租', amount: 22_170 }])
})
