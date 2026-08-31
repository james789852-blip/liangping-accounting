import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasSelectableVendorItems,
  isVendorOnlyMapping,
} from '../lib/vendor-only-mapping.ts'

test('只有廠商分類設定時不顯示品項選擇框', () => {
  const mapping = {
    item_name: '阿一蔬果',
    excel_column: '阿一蔬果',
    vendor_group: '阿一蔬果',
    item_category: '耗材',
  }

  assert.equal(isVendorOnlyMapping(mapping), true)
  assert.equal(hasSelectableVendorItems('阿一蔬果', [mapping]), false)
})

test('廠商新增真正品項後才顯示品項選擇框', () => {
  const mappings = [
    {
      item_name: '阿一蔬果',
      excel_column: '阿一蔬果',
      vendor_group: '阿一蔬果',
    },
    {
      item_name: '蔬菜耗材',
      excel_column: '蔬菜耗材',
      vendor_group: '阿一蔬果',
    },
  ]

  assert.equal(hasSelectableVendorItems('阿一蔬果', mappings), true)
})

test('只有稅外加設定也不要求選擇品項', () => {
  const mappings = [{
    item_name: '阿一蔬果稅金',
    excel_column: '阿一蔬果稅金',
    vendor_group: '阿一蔬果',
    is_tax_addon: true,
  }]

  assert.equal(hasSelectableVendorItems('阿一蔬果', mappings), false)
})
