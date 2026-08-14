import assert from 'node:assert/strict'
import test from 'node:test'

import { storeReportedAmountsFromClosings } from '../lib/ck-store-reporting.ts'

test('central-kitchen screen reads store report from the submitted closing', () => {
  const amounts = storeReportedAmountsFromClosings([
    { store_id: 'jingxin', status: 'draft', updated_at: '2026-08-12T01:00:00Z', total_cost: 0 },
    { store_id: 'jingxin', status: 'verified', updated_at: '2026-08-13T01:00:00Z', total_cost: 31_170 },
    { store_id: 'xindian', status: 'verified', total_cost: 0, order_items: [{ total_amount: 24_500 }] },
  ])

  assert.deepEqual(amounts, { jingxin: 31_170, xindian: 24_500 })
})
