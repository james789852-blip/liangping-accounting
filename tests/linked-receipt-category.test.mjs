import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  applyLinkedReceiptCategories,
  applyLinkedReceiptCategory,
  normalizeVendorGroupName,
  CK_LINKED_RECEIPT_CATEGORY_NAMES,
  resolveReceiptVendorGroupNames,
  resolveDefaultLinkableReceiptCategoryNames,
  resolveLinkedReceiptCategoryNames,
  STORE_LINKED_RECEIPT_CATEGORY_NAMES,
} from '../lib/linked-receipt-category.ts'

const receiptSettingsSource = await readFile(
  new URL('../components/manager/receipt-settings.tsx', import.meta.url),
  'utf8',
)
const itemMappingActionSource = await readFile(
  new URL('../app/actions/item-mappings.ts', import.meta.url),
  'utf8',
)

test('買東西或維修設定完整顯示品項管理內容', () => {
  const categories = [{
    id: 'category-1',
    name: '買東西或維修',
    vendors: ['發票', '收據', '估價單', '其他'].map((name, index) => ({ id: String(index), name })),
  }]
  const result = applyLinkedReceiptCategory(categories, '買東西或維修', [
    { item_name: '發票' },
    { item_name: '發票-稅金', is_tax_addon: true },
    { item_name: '收據' },
    { item_name: '估價單' },
    { item_name: '其他' },
    { item_name: '賣東西給分店' },
    { item_name: '與分店買東西' },
  ])

  assert.deepEqual(result[0].vendors.map(item => item.name), [
    '發票', '發票-稅金', '收據', '估價單', '其他', '賣東西給分店', '與分店買東西',
  ])
})

test('店面指定收據類別會各自同步同名品項分類', () => {
  const categoryNames = ['買東西或維修', '日常用品', '其他', '退稅', '雜項', '菜商']
  const categories = categoryNames.map((name, index) => ({
    id: `category-${index}`,
    name,
    vendors: [{ id: `old-${index}`, name: `舊${name}` }],
  }))
  const result = applyLinkedReceiptCategories(categories, STORE_LINKED_RECEIPT_CATEGORY_NAMES, [
    { vendor_group: '買東西或維修', item_name: '發票' },
    { vendor_group: '日常用品', item_name: '衛生紙' },
    { vendor_group: '其他', item_name: '瓦斯費' },
    { vendor_group: '退稅', item_name: '免洗稅金' },
    { vendor_group: null, item_name: '房租' },
    { vendor_group: '未分類', item_name: '電費' },
    { vendor_group: '雜項', item_name: '電話費' },
  ])

  assert.deepEqual(Object.fromEntries(result.map(category => [
    category.name,
    category.vendors.map(item => item.name),
  ])), {
    '買東西或維修': ['發票'],
    '日常用品': ['衛生紙'],
    '其他': ['瓦斯費'],
    '退稅': ['免洗稅金'],
    '雜項': ['房租', '電費', '電話費'],
    '菜商': ['舊菜商'],
  })
})

test('空白與舊未分類名稱在所有品項管理畫面統一顯示為雜項', () => {
  assert.equal(normalizeVendorGroupName(null), '雜項')
  assert.equal(normalizeVendorGroupName(''), '雜項')
  assert.equal(normalizeVendorGroupName('未分類'), '雜項')
  assert.equal(normalizeVendorGroupName('雜項'), '雜項')
  assert.equal(normalizeVendorGroupName('菜商'), '菜商')
})

test('央廚收據的日常用品、加油或停車與退稅也同步品項管理', () => {
  const categories = ['買東西或維修', '日常用品', '加油或停車', '退稅', '雜項'].map((name, index) => ({
    id: `ck-category-${index}`,
    name,
    vendors: [],
  }))
  const result = applyLinkedReceiptCategories(categories, CK_LINKED_RECEIPT_CATEGORY_NAMES, [
    { vendor_group: '買東西或維修', item_name: '維修單' },
    { vendor_group: '日常用品', item_name: '清潔用品' },
    { vendor_group: '加油或停車', item_name: '停車費' },
    { vendor_group: '退稅', item_name: '發票稅金' },
    { vendor_group: null, item_name: '臨時支出' },
  ])

  assert.deepEqual(Object.fromEntries(result.map(category => [
    category.name,
    category.vendors.map(item => item.name),
  ])), {
    '買東西或維修': ['維修單'],
    '日常用品': ['清潔用品'],
    '加油或停車': ['停車費'],
    '退稅': ['發票稅金'],
    '雜項': ['臨時支出'],
  })
})

test('舊央廚沒有待同步標記時，仍從既有品項辨識獨立類別', () => {
  const linkable = resolveDefaultLinkableReceiptCategoryNames([
    { vendor_group: '雞肉商', item_name: '雞腿' },
    { vendor_group: '菜商', item_name: '辣椒' },
    { vendor_group: '日常用品', item_name: '洗劑' },
    { vendor_group: '貨車相關保養', item_name: '加油錢' },
    { vendor_group: '買東西或維修', item_name: '發票' },
    { vendor_group: '退稅', item_name: '總發票-稅金' },
    { vendor_group: null, item_name: '房租' },
    { vendor_group: '日常用品', item_name: '稅外加', is_tax_addon: true },
  ], CK_LINKED_RECEIPT_CATEGORY_NAMES, ['廠商'])

  assert.deepEqual(linkable, ['日常用品', '貨車相關保養', '買東西或維修', '退稅', '雜項'])
})

test('品項管理分類改名後，收據管理會依同名分類自動維持連動', () => {
  const categories = [{
    id: 'truck-category',
    name: '貨車相關保養',
    vendors: [{ id: 'old', name: '舊品項' }],
  }]
  const mappings = [
    { vendor_group: '貨車相關保養', item_name: '貨車加油' },
    { vendor_group: '貨車相關保養', item_name: '定期保養' },
  ]

  const linkedNames = resolveLinkedReceiptCategoryNames(
    categories,
    CK_LINKED_RECEIPT_CATEGORY_NAMES,
    mappings,
  )
  const result = applyLinkedReceiptCategories(categories, linkedNames, mappings)

  assert.deepEqual(linkedNames, ['貨車相關保養'])
  assert.deepEqual(result[0].vendors.map(item => item.name), ['貨車加油', '定期保養'])
})

test('剛建立且尚無品項的分類，也會在收據管理標示為品項管理同步', () => {
  const categories = [{ id: 'new-category', name: '設備租賃', vendors: [] }]
  const linkedNames = resolveLinkedReceiptCategoryNames(
    categories,
    CK_LINKED_RECEIPT_CATEGORY_NAMES,
    [],
    ['設備租賃'],
  )

  assert.deepEqual(linkedNames, ['設備租賃'])
})

test('已同步類別不重複出現在選單，且可只從收據管理移除', () => {
  assert.match(receiptSettingsSource, /已同步的類別會顯示在下方，不會重複出現在此選單/)
  assert.match(receiptSettingsSource, /品項管理的類別與品項不會刪除/)
  assert.match(receiptSettingsSource, /從收據管理移除「\$\{cat\.name\}」/)
})

test('菜商、雜貨與免洗歸在廠商，獨立類別不會混入', () => {
  const vendorGroups = resolveReceiptVendorGroupNames([
    { vendor_group: '菜商', item_name: '辣椒' },
    { vendor_group: '雜貨', item_name: '米' },
    { vendor_group: '免洗', item_name: '紙碗' },
    { vendor_group: '雞肉商', item_name: '雞腿' },
    { vendor_group: '日常用品', item_name: '衛生紙' },
    { vendor_group: '貨車相關保養', item_name: '換機油' },
    { vendor_group: '菜商', item_name: '菜商稅金', is_tax_addon: true },
    { vendor_group: '未分類', item_name: '臨時支出' },
  ], ['貨車相關保養'])

  assert.deepEqual(vendorGroups, ['菜商', '雜貨', '免洗', '雞肉商'])
})

test('新增品項群組明確區分廠商子類別與獨立收據類別', () => {
  assert.match(itemMappingActionSource, /mode: 'vendor' \| 'direct' = 'vendor'/)
  assert.match(itemMappingActionSource, /name: '廠商'/)
  assert.match(itemMappingActionSource, /sort_order: -2/)
  assert.match(itemMappingActionSource, /export async function setStoreVendorGroupMode/)
  assert.match(itemMappingActionSource, /修改單一據點的分類層級，不移動或刪除底下品項/)
})
