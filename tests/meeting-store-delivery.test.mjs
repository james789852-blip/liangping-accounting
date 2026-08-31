import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoreDeliveryEntries, storeDeliveryMap } from '../lib/meeting-store-delivery.ts'

test('店內外送每日金額會去除無效資料並以同日期最後一筆為準', () => {
  assert.deepEqual(normalizeStoreDeliveryEntries([
    { date: '2026-08-10', amount: 320 },
    { date: 'bad-date', amount: 100 },
    { date: '2026-08-09', amount: '150.4' },
    { date: '2026-08-10', amount: 480 },
    { date: '2026-08-11', amount: -1 },
  ]), [
    { date: '2026-08-09', amount: 150 },
    { date: '2026-08-10', amount: 480 },
  ])
})

test('店內外送輸入零元會移除該日期紀錄', () => {
  const result = storeDeliveryMap([
    { date: '2026-08-10', amount: 320 },
    { date: '2026-08-10', amount: 0 },
  ])
  assert.equal(result.has('2026-08-10'), false)
})
