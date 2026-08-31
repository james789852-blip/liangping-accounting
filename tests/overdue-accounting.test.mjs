import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  overdueTrackingStartForStore,
  shouldTrackStoreAccountingDate,
} from '../lib/overdue-accounting.ts'

test('新央廚從建立隔天才開始追蹤帳目', () => {
  assert.equal(overdueTrackingStartForStore('2026-08-25T15:00:00+08:00'), '2026-08-26')
  assert.equal(shouldTrackStoreAccountingDate('2026-08-25', '2026-08-25T15:00:00+08:00'), false)
  assert.equal(shouldTrackStoreAccountingDate('2026-08-26', '2026-08-25T15:00:00+08:00'), true)
})

test('建立時間會依台灣日期判斷，不受伺服器時區影響', () => {
  assert.equal(overdueTrackingStartForStore('2026-08-25T17:30:00Z'), '2026-08-27')
})

test('既有店家仍從系統正式啟用日開始追蹤', () => {
  assert.equal(overdueTrackingStartForStore('2026-06-01T10:00:00+08:00'), '2026-07-12')
  assert.equal(overdueTrackingStartForStore(null), '2026-07-12')
})

test('總公司逾期提醒查詢店家建立時間並套用個別日期下限', () => {
  const source = fs.readFileSync(new URL('../app/actions/hq-alerts.ts', import.meta.url), 'utf8')
  assert.match(source, /select\('id, name, type, created_at'\)/)
  assert.match(source, /shouldTrackStoreAccountingDate\(date, s\.created_at, overdueStart\)/)
})
