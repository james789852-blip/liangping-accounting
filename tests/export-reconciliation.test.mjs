import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveExportReconciliation,
  resolveCentralKitchenOrderTarget,
  resolveScopedItemIdentity,
} from '../lib/export-reconciliation.ts'
import { itemNameCompatibilityKey } from '../lib/item-name-compat.ts'
import { historicalItemSyncTargets } from '../lib/item-history-scope.ts'

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

test('central-kitchen order source overrides a stale external-vendor item name', () => {
  const items = [
    { name: '上逸-滷肉', vendor_group: '上逸' },
    { name: '滷肉', vendor_group: '央廚配送' },
  ]

  assert.deepEqual(
    resolveCentralKitchenOrderTarget('上逸-滷肉', items, itemNameCompatibilityKey),
    { itemName: '滷肉', vendorGroup: '央廚配送' },
  )
})

test('central-kitchen oil shallot alias stays in central-kitchen mapping', () => {
  const items = [
    { name: '上逸-油蔥', vendor_group: '上逸' },
    { name: '油蔥', vendor_group: '央廚配送' },
    { name: '油蔥酥', vendor_group: '雜貨' },
  ]

  assert.deepEqual(
    resolveCentralKitchenOrderTarget('油蔥酥', items, itemNameCompatibilityKey),
    { itemName: '油蔥', vendorGroup: '央廚配送' },
  )
})

test('unmapped central-kitchen order never falls back to another vendor', () => {
  const items = [{ name: '上逸-新品', vendor_group: '上逸' }]

  assert.deepEqual(
    resolveCentralKitchenOrderTarget('上逸-新品', items, itemNameCompatibilityKey),
    { itemName: '上逸-新品', vendorGroup: '央廚配送' },
  )
})

test('central-kitchen oil shallot names share one compatibility key', () => {
  assert.equal(itemNameCompatibilityKey('油蔥酥'), itemNameCompatibilityKey('油蔥'))
})

test('same-name items resolve by mapping id and never by candidate order', () => {
  const items = [
    { id: 'upstream-id', name: '滷肉', vendor_group: '上逸' },
    { id: 'ck-id', name: '滷肉', vendor_group: '央廚配送' },
  ]

  assert.deepEqual(
    resolveScopedItemIdentity(
      { mappingId: 'ck-id', vendorGroup: '央廚配送', itemName: '滷肉' },
      items,
      itemNameCompatibilityKey,
    ),
    items[1],
  )
  assert.equal(
    resolveScopedItemIdentity({ itemName: '滷肉' }, items, itemNameCompatibilityKey),
    undefined,
  )
})

test('historical item follows its mapping id after the mapping is moved to a new vendor group', () => {
  const movedItem = { id: 'a-yi-id', name: '阿一蔬果', vendor_group: '阿一蔬果', category: '耗材' }

  assert.deepEqual(
    resolveScopedItemIdentity(
      { mappingId: 'a-yi-id', vendorGroup: '日常用品', itemName: '阿一蔬果' },
      [movedItem],
      itemNameCompatibilityKey,
    ),
    movedItem,
  )
})

test('external vendor rename cannot rewrite central-kitchen order history', () => {
  assert.deepEqual(historicalItemSyncTargets('上逸'), {
    receiptItems: true,
    orderItems: false,
  })
  assert.deepEqual(historicalItemSyncTargets('央廚配送'), {
    receiptItems: false,
    orderItems: true,
  })
})
