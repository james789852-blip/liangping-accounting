import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveExportReconciliation,
  resolveOrderItemVendorGroup,
} from '../lib/export-reconciliation.ts'

test('submitted closing keeps the stored system variance in Excel', () => {
  const result = deriveExportReconciliation({
    actual: 17_340,
    centralKitchen: 28_190,
    onsite: 31_790,
    itemizedCost: 42_325,
    storedVariance: 0,
  })

  assert.deepEqual(result, { variance: 0, afterDeduct: -10_850 })
})

test('rows without a closing still derive variance from itemized costs', () => {
  const result = deriveExportReconciliation({
    actual: 17_340,
    centralKitchen: 28_190,
    onsite: 31_790,
    itemizedCost: 42_325,
    storedVariance: null,
  })

  assert.deepEqual(result, { variance: -315, afterDeduct: -10_535 })
})

test('legacy single mapping receives a central-kitchen order amount', () => {
  assert.equal(resolveOrderItemVendorGroup([{ vendor_group: '雜貨' }]), '雜貨')
  assert.equal(resolveOrderItemVendorGroup([{ vendor_group: '央廚配送' }]), '央廚配送')
  assert.equal(
    resolveOrderItemVendorGroup([{ vendor_group: '雜貨' }, { vendor_group: '央廚配送' }]),
    '央廚配送',
  )
})
