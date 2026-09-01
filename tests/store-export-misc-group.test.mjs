import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { normalizeVendorGroupName } from '../lib/linked-receipt-category.ts'

const workbookSource = await readFile(
  new URL('../lib/food-cost-native-workbook.ts', import.meta.url),
  'utf8',
)

test('店面 Excel 將舊空白、未分類與新雜項品項合併顯示為雜項', () => {
  assert.equal(normalizeVendorGroupName(null), '雜項')
  assert.equal(normalizeVendorGroupName('未分類'), '雜項')
  assert.equal(normalizeVendorGroupName('雜項'), '雜項')
  assert.match(workbookSource, /const vendorGroup = normalizeVendorGroupName\(it\.vendor_group\)/)
  assert.match(workbookSource, /vendorGroup,\n\s+docType:/)
})

test('舊帳目保存未分類快照時仍會填入新版雜項欄位', () => {
  assert.match(workbookSource, /normalizeVendorGroupName\(scopedVendorGroup\) === normalizedVendorGroup/)
  assert.match(workbookSource, /scopedItemName === key/)
})
