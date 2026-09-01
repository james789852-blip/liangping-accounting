import assert from 'node:assert/strict'
import test from 'node:test'

import { groupCKExpensesByReceipt } from '../lib/ck-expense-receipt-groups.ts'

test('同廠商的不同照片會各自對應自己的金額', () => {
  const groups = groupCKExpensesByReceipt([
    { category: '耗材', vendor_group: '貨車相關保養', item_name: '加油錢', amount: 700, receipt_photo_url: 'photo-a.jpg' },
    { category: '耗材', vendor_group: '貨車相關保養', item_name: '加油錢', amount: 967, receipt_photo_url: 'photo-b.jpg' },
  ])

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(group => ({ photo: group.photoUrls[0], total: group.total })), [
    { photo: 'photo-a.jpg', total: 700 },
    { photo: 'photo-b.jpg', total: 967 },
  ])
})

test('同一張照片有多個品項時只顯示一次照片並對應品項合計', () => {
  const groups = groupCKExpensesByReceipt([
    { category: '雜項', vendor_group: '買東西或維修', item_name: '收據', amount: 9870, receipt_photo_url: 'receipt.jpg' },
    { category: '雜項', vendor_group: '買東西或維修', item_name: '賣東西給分店', amount: -27180, receipt_photo_url: 'receipt.jpg' },
  ])

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].photoUrls, ['receipt.jpg'])
  assert.equal(groups[0].expenses.length, 2)
  assert.equal(groups[0].total, -17310)
})

test('沒有照片的手動支出仍依類別與廠商整理', () => {
  const groups = groupCKExpensesByReceipt([
    { category: '食材', vendor_group: '菜商', item_name: '青菜', amount: 100 },
    { category: '食材', vendor_group: '菜商', item_name: '水果', amount: 200 },
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].total, 300)
  assert.deepEqual(groups[0].photoUrls, [])
})
