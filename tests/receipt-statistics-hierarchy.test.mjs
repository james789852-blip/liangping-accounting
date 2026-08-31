import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildReceiptStatisticsHierarchy,
  receiptStatisticsCategoryOrder,
  resolveReceiptStatisticsCategory,
} from '../lib/receipt-statistics-hierarchy.ts'

const categories = [
  { id: 'vendor-parent', store_id: 'store-1', name: '廠商', sort_order: 10 },
  { id: 'daily', store_id: 'store-1', name: '日常用品', sort_order: 20 },
]
const vendors = [
  { store_id: 'store-1', category_id: 'vendor-parent', name: '菜商' },
  { store_id: 'store-1', category_id: 'vendor-parent', name: '免洗' },
  { store_id: 'store-1', category_id: 'vendor-parent', name: '雜貨' },
]
const mappings = [
  { store_id: 'store-1', vendor_group: '日常用品', item_name: '衛生紙' },
  { store_id: 'store-1', vendor_group: '日常用品', item_name: '衛生紙稅金', is_tax_addon: true },
]

test('統計中心依收據管理整理廠商子類別', () => {
  const hierarchy = buildReceiptStatisticsHierarchy(categories, vendors, mappings)

  assert.equal(resolveReceiptStatisticsCategory(hierarchy, 'store-1', '菜商'), '廠商')
  assert.equal(resolveReceiptStatisticsCategory(hierarchy, 'store-1', '免洗'), '廠商')
  assert.equal(resolveReceiptStatisticsCategory(hierarchy, 'store-1', '雜貨'), '廠商')
})

test('品項管理連動的獨立類別也沿用收據管理大類別', () => {
  const hierarchy = buildReceiptStatisticsHierarchy(categories, vendors, mappings)

  assert.equal(resolveReceiptStatisticsCategory(hierarchy, 'store-1', '衛生紙'), '日常用品')
  assert.equal(receiptStatisticsCategoryOrder(hierarchy, 'store-1', '廠商'), 10)
  assert.equal(receiptStatisticsCategoryOrder(hierarchy, 'store-1', '日常用品'), 20)
})

test('沒有收據管理歸屬的項目會明確列為未分類', () => {
  const hierarchy = buildReceiptStatisticsHierarchy(categories, vendors, mappings)
  assert.equal(resolveReceiptStatisticsCategory(hierarchy, 'store-1', '未知支出'), '未分類')
})

test('統計中心未填實際廠商時不顯示提示文字', async () => {
  const dashboard = await readFile(new URL('../app/hq/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(dashboard, /未填實際廠商/)
  assert.match(dashboard, /detail\.actualVendor &&/)
})
