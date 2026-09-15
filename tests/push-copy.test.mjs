import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPendingReviewNotification,
  hqAccountingUrl,
  managerAccountingUrl,
} from '../lib/push-copy.ts'

test('單筆店面送審通知包含單位、送出人、日期並精準導向審核頁', () => {
  const notification = buildPendingReviewNotification([{
    accountingKind: 'store',
    storeId: 'store/1',
    storeName: '府中',
    recordId: 'closing-1',
    businessDate: '2026-09-15',
    senderName: '王小明',
  }])

  assert.equal(notification.title, '府中帳目待審核')
  assert.match(notification.body, /2026-09-15｜王小明已送出店面帳目/)
  assert.equal(notification.url, '/hq/accounting?tab=store&storeId=store%2F1&date=2026-09-15')
})

test('單筆央廚送審通知精準導向央廚與帳務日期', () => {
  const notification = buildPendingReviewNotification([{
    accountingKind: 'ck',
    storeId: 'ck-1',
    storeName: '新莊央廚',
    recordId: 'ck-record-1',
    businessDate: '2026-09-14',
    senderName: '陳昭雄',
  }])

  assert.equal(notification.title, '新莊央廚帳目待審核')
  assert.match(notification.body, /陳昭雄已送出央廚帳目/)
  assert.equal(notification.url, '/hq/accounting?tab=ck&ckStoreId=ck-1&date=2026-09-14')
})

test('多筆合併通知列出單位、送出人與日期並導向當日待審清單', () => {
  const notification = buildPendingReviewNotification([
    {
      accountingKind: 'store', storeId: 'store-1', storeName: '府中', recordId: 'a',
      businessDate: '2026-09-15', senderName: '王小明',
    },
    {
      accountingKind: 'ck', storeId: 'ck-1', storeName: '新莊央廚', recordId: 'b',
      businessDate: '2026-09-15', senderName: '陳昭雄',
    },
  ])

  assert.equal(notification.title, '2 間單位、2 筆帳目待審核')
  assert.match(notification.body, /府中／王小明／2026-09-15/)
  assert.match(notification.body, /新莊央廚／陳昭雄／2026-09-15/)
  assert.equal(notification.url, '/hq/accounting?date=2026-09-15')
})

test('店面與央廚的店端通知網址皆定位到該筆帳目', () => {
  assert.equal(managerAccountingUrl('store', 'closing/1', '2026-09-15'), '/manager/history/closing%2F1')
  assert.equal(managerAccountingUrl('ck', 'ignored', '2026-09-15'), '/manager/ck?date=2026-09-15')
  assert.equal(hqAccountingUrl('ck', 'ck/1', '2026-09-15'), '/hq/accounting?tab=ck&ckStoreId=ck%2F1&date=2026-09-15')
})
