import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { resolveReceiptDocumentTypeInfo } from '../lib/receipt-document-type.ts'

const mappings = [
  { id: 'paper-a', store_id: 'store-a', item_name: '900碗', vendor_group: '有厲', doc_type_override: '估價單' },
  { id: 'paper-b', store_id: 'store-a', item_name: '900碗', vendor_group: '免洗二廠', doc_type_override: '發票' },
  { id: 'lid-a', store_id: 'store-a', item_name: '900蓋', vendor_group: '有厲', doc_type_override: '估價單' },
]

test('review document type uses mapping id before duplicate item names', () => {
  const info = resolveReceiptDocumentTypeInfo({
    store_id: 'store-a',
    vendor_name: '有厲',
    receipt_items: [{ item_name: '900碗', item_mapping_id: 'paper-a', vendor_group_snapshot: '有厲' }],
  }, mappings)

  assert.deepEqual(info.expectedDocumentTypes, ['估價單'])
})

test('review document type uses vendor snapshot for historical rows without mapping id', () => {
  const info = resolveReceiptDocumentTypeInfo({
    store_id: 'store-a',
    vendor_name: '有厲',
    receipt_items: [{ item_name: '900碗', vendor_group_snapshot: '有厲' }],
  }, mappings)

  assert.deepEqual(info.expectedDocumentTypes, ['估價單'])
  assert.deepEqual(info.configuredVendorGroups, ['有厲'])
})

test('duplicate item names never leak another vendor document type', () => {
  const info = resolveReceiptDocumentTypeInfo({
    store_id: 'store-a',
    vendor_name: '未知廠商',
    receipt_items: [{ item_name: '900碗' }],
  }, mappings)

  assert.deepEqual(info.expectedDocumentTypes, [])
})

test('vendor-only receipt inherits one consistent configured document type', () => {
  const info = resolveReceiptDocumentTypeInfo({
    store_id: 'store-a',
    vendor_name: '有厲',
    receipt_items: [],
  }, mappings)

  assert.deepEqual(info.expectedDocumentTypes, ['估價單'])
})

test('custom configured document types stay available for read-only review display', () => {
  const info = resolveReceiptDocumentTypeInfo({
    store_id: 'store-a',
    vendor_name: '公司開分類',
    receipt_items: [{ item_name: '紙巾', item_mapping_id: 'company-paper' }],
  }, [
    ...mappings,
    { id: 'company-paper', store_id: 'store-a', item_name: '紙巾', vendor_group: '公司開分類', doc_type_override: '公司開' },
  ])

  assert.deepEqual(info.expectedDocumentTypes, ['公司開'])
})

test('HQ review displays the configured document type without an editable choice', () => {
  const reviewPage = fs.readFileSync(new URL('../app/hq/reviews/page.tsx', import.meta.url), 'utf8')
  const reviewCard = fs.readFileSync(new URL('../components/hq/review-card.tsx', import.meta.url), 'utf8')

  assert.match(reviewPage, /item_mapping_id, vendor_group_snapshot/)
  assert.match(reviewPage, /resolveReceiptDocumentTypeInfo/)
  assert.match(reviewCard, /單據類型：\{expectedLabel\}/)
  assert.doesNotMatch(reviewCard, /店長選擇/)
})
