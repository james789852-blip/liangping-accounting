import assert from 'node:assert/strict'
import test from 'node:test'

import { confirmedMemberAmountMap } from '../lib/ck-member-amounts.ts'

test('central-kitchen ledger ignores legacy store-reported amounts', () => {
  const amounts = confirmedMemberAmountMap([
    { store_id: 'store-a', amount: 31_170, ck_confirmed_amount: null },
    { store_id: 'store-b', amount: 24_500, ck_confirmed_amount: 25_000 },
  ])

  assert.deepEqual(amounts, {
    'store-a': null,
    'store-b': 25_000,
  })
})
