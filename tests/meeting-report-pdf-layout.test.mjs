import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPdfDailyComparisonRows,
  buildPdfRevenueRows,
  choosePdfDensity,
  photoGridClass,
} from '../lib/meeting-report-pdf-layout.ts'

const comparison = {
  current: {
    total: 150_000,
    onsite: 80_000,
    uber: 25_000,
    panda: 15_000,
    online: 10_000,
    storeDelivery: 20_000,
    deliveryTotal: 60_000,
  },
  previous: {
    total: 130_000,
    onsite: 75_000,
    uber: 20_000,
    panda: 20_000,
    online: 5_000,
    storeDelivery: 10_000,
    deliveryTotal: 50_000,
  },
  channels: { uber: true, panda: true, online: true },
}

test('會議 PDF 會列出所有啟用通路的兩期差異金額與百分比', () => {
  const rows = buildPdfRevenueRows(comparison)

  assert.deepEqual(rows.map(row => row.label), [
    '總營業額',
    '現場',
    '優步外送',
    '熊貓外送',
    '店內外送',
    '外送合計',
    '線上點餐',
  ])
  assert.deepEqual(
    rows.map(row => [row.label, row.difference, row.percentage]),
    [
      ['總營業額', 20_000, '+15.4%'],
      ['現場', 5_000, '+6.7%'],
      ['優步外送', 5_000, '+25.0%'],
      ['熊貓外送', -5_000, '-25.0%'],
      ['店內外送', 10_000, '+100.0%'],
      ['外送合計', 10_000, '+20.0%'],
      ['線上點餐', 5_000, '+100.0%'],
    ],
  )
})

test('未啟用的平台不會出現在會議 PDF', () => {
  const rows = buildPdfRevenueRows({
    ...comparison,
    channels: { uber: true, panda: false, online: false },
  })

  assert.equal(rows.some(row => row.label === '熊貓外送'), false)
  assert.equal(rows.some(row => row.label === '線上點餐'), false)
  assert.equal(rows.some(row => row.label === '優步外送'), true)
})

test('單張照片使用較大的完整照片版位', () => {
  assert.equal(photoGridClass(1), 'photos photos-single')
  assert.equal(photoGridClass(2), 'photos')
})

test('每日營業額依本期與前期的日期序次配對', () => {
  const current = [
    { date: '2026-08-17', hasData: true, total: 100, onsite: 60, uber: 20, panda: 10, online: 5, storeDelivery: 10, deliveryTotal: 40 },
    { date: '2026-08-18', hasData: true, total: 120, onsite: 70, uber: 25, panda: 10, online: 5, storeDelivery: 15, deliveryTotal: 50 },
  ]
  const previous = [
    { date: '2026-08-03', hasData: true, total: 90, onsite: 55, uber: 15, panda: 10, online: 5, storeDelivery: 10, deliveryTotal: 35 },
  ]

  const rows = buildPdfDailyComparisonRows(current, previous)

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => [row.sequence, row.current?.date, row.previous?.date ?? null]), [
    [1, '2026-08-17', '2026-08-03'],
    [2, '2026-08-18', null],
  ])
})

test('PDF 依內容量選擇可讀的字體與段落密度', () => {
  assert.equal(choosePdfDensity({ dailyRowCount: 14, entryCount: 1, photoCount: 0, textLength: 200 }), 'comfortable')
  assert.equal(choosePdfDensity({ dailyRowCount: 28, entryCount: 2, photoCount: 2, textLength: 500 }), 'balanced')
  assert.equal(choosePdfDensity({ dailyRowCount: 28, entryCount: 6, photoCount: 6, textLength: 1000 }), 'dense')
})
