import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCentralKitchenExpenseDocType } from '../lib/ck-expense-doc-type.ts'

const mappings = [
  { vendor_group: '菜商', item_name: '大辣椒', doc_type_override: '公司開' },
  { vendor_group: '菜商', item_name: '小辣椒', doc_type_override: '公司開' },
  { vendor_group: '雜貨', item_name: '紙巾', doc_type_override: '收據' },
]

test('vendor-only central-kitchen expense inherits the vendor mapping document type', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '菜商',
    itemName: '菜商',
    storedDocType: '發票',
    mappings,
  }), '公司開')
})

test('exact item mapping is authoritative over a stale stored document type', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '菜商',
    itemName: '大辣椒',
    storedDocType: '發票',
    mappings,
  }), '公司開')
})

test('mixed-document vendor keeps stored type when no item was entered', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '菜商',
    itemName: '菜商',
    storedDocType: '收據',
    mappings: [
      ...mappings,
      { vendor_group: '菜商', item_name: '薑', doc_type_override: '發票' },
    ],
  }), '收據')
})

test('unmapped vendor keeps its stored document type', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '臨時廠商',
    itemName: '臨時廠商',
    storedDocType: '發票',
    mappings,
  }), '發票')
})

test('an explicitly blank item mapping stays unclassified instead of inheriting the form default', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '雞肉商',
    itemName: '順正',
    storedDocType: '發票',
    mappings: [
      { vendor_group: '雞肉商', item_name: '順正', doc_type_override: null },
      { vendor_group: '雞肉商', item_name: '淳香', doc_type_override: null },
    ],
  }), '')
})

test('a vendor whose configured items are all blank stays unclassified', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '雞肉商',
    itemName: '雞肉商',
    storedDocType: '發票',
    mappings: [
      { vendor_group: '雞肉商', item_name: '順正', doc_type_override: null },
      { vendor_group: '雞肉商', item_name: '淳香', doc_type_override: null },
    ],
  }), '')
})

test('a direct item with no vendor group overrides a stale vendor and document type', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '獎金',
    itemName: '獎金',
    storedDocType: '發票',
    mappings: [
      { vendor_group: null, item_name: '獎金', doc_type_override: null },
    ],
  }), '')
})

test('a configured direct item document type is applied to historical expenses', () => {
  assert.equal(resolveCentralKitchenExpenseDocType({
    vendorGroup: '獎金',
    itemName: '獎金',
    storedDocType: '發票',
    mappings: [
      { vendor_group: null, item_name: '獎金', doc_type_override: '公司開' },
    ],
  }), '公司開')
})

test('legacy empty, unclassified and new miscellaneous groups share the same central-kitchen mapping', () => {
  for (const vendorGroup of [null, '未分類', '雜項']) {
    assert.equal(resolveCentralKitchenExpenseDocType({
      vendorGroup,
      itemName: '水費',
      storedDocType: '發票',
      mappings: [
        { vendor_group: null, item_name: '水費', doc_type_override: '收據' },
      ],
    }), '收據')
  }
})
