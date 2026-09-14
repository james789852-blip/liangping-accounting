import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  overdueAccountingStatus,
  overdueTrackingStartForStore,
  shouldTrackStoreAccountingDate,
} from '../lib/overdue-accounting.ts'

test('新央廚從建立隔天才開始追蹤帳目', () => {
  assert.equal(overdueTrackingStartForStore('2026-09-05T15:00:00+08:00'), '2026-09-06')
  assert.equal(shouldTrackStoreAccountingDate('2026-09-05', '2026-09-05T15:00:00+08:00'), false)
  assert.equal(shouldTrackStoreAccountingDate('2026-09-06', '2026-09-05T15:00:00+08:00'), true)
})

test('建立時間會依台灣日期判斷，不受伺服器時區影響', () => {
  assert.equal(overdueTrackingStartForStore('2026-09-05T17:30:00Z'), '2026-09-07')
})

test('既有店家仍從系統正式啟用日開始追蹤', () => {
  assert.equal(overdueTrackingStartForStore('2026-06-01T10:00:00+08:00'), '2026-09-01')
  assert.equal(overdueTrackingStartForStore(null), '2026-09-01')
})

test('總公司逾期提醒查詢店家建立時間並套用個別日期下限', () => {
  const source = fs.readFileSync(new URL('../app/actions/hq-alerts.ts', import.meta.url), 'utf8')
  assert.match(source, /select\('id, name, type, created_at'\)/)
  assert.match(source, /shouldTrackStoreAccountingDate\(date, s\.created_at, overdueStart\)/)
})

test('6、7 月測試資料不會列入待審數量或正式審核佇列', () => {
  const pendingCount = fs.readFileSync(new URL('../app/actions/pending-review.ts', import.meta.url), 'utf8')
  const reviewsPage = fs.readFileSync(new URL('../app/hq/reviews/page.tsx', import.meta.url), 'utf8')
  assert.match(pendingCount, /gte\('business_date', SYSTEM_OVERDUE_TRACKING_START\)/)
  assert.match(reviewsPage, /gte\('business_date', SYSTEM_OVERDUE_TRACKING_START\)/)
})

test('退回後尚未重新送出的帳目會持續列入總公司逾期提醒', () => {
  assert.equal(overdueAccountingStatus(undefined), 'not_submitted')
  assert.equal(overdueAccountingStatus('submitted'), 'review')
  assert.equal(overdueAccountingStatus('disputed'), 'dispute')
  assert.equal(overdueAccountingStatus('verified'), null)
})
