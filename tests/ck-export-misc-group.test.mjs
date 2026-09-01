import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { normalizeVendorGroupName } from '../lib/linked-receipt-category.ts'

const aggregatorSource = await readFile(
  new URL('../lib/ck-aggregator.ts', import.meta.url),
  'utf8',
)
const workbookSource = await readFile(
  new URL('../lib/ck-native-workbook.ts', import.meta.url),
  'utf8',
)

test('央廚月統計將舊空白、未分類與新雜項帳目統一成雜項', () => {
  assert.equal(normalizeVendorGroupName(null), '雜項')
  assert.equal(normalizeVendorGroupName('未分類'), '雜項')
  assert.equal(normalizeVendorGroupName('雜項'), '雜項')
  assert.match(aggregatorSource, /normalizeVendorGroupName\(mappedItem\?\.vendor_group \?\? storedVendorGroup\)/)
  assert.match(aggregatorSource, /vendor_group: vendorGroup/)
})

test('央廚 Excel 與 Google 試算表共用的工作簿合併舊、新雜項欄位', () => {
  assert.match(workbookSource, /return compactKey\(normalizeVendorGroupName\(value\)\)/)
  assert.match(workbookSource, /vendor_group: canonicalVendorGroup\(m\.vendor_group\)/)
  assert.match(workbookSource, /canonicalVendorGroup\(mapped\?\.vendor_group \?\? expense\.vendor_group\)/)
})
