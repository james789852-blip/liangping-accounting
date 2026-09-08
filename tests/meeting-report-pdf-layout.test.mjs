import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
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

test('會議報告以週對週合計比較，且每日明細不再依日序配對', async () => {
  const [pdfRoute, submittedView, editView] = await Promise.all([
    readFile(new URL('../app/api/meeting-report/[id]/pdf/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/manager/meeting-report/[id]/submitted-report-view.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/manager/meeting-report/[id]/edit-client.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(pdfRoute, /兩週之間的營業額與通路對比/)
  assert.match(pdfRoute, /本期週/)
  assert.match(pdfRoute, /前期週/)
  assert.match(pdfRoute, /較前期/)
  assert.match(pdfRoute, /兩週各自的每日營業明細/)
  assert.doesNotMatch(pdfRoute, /相同日序配對|第 \$\{sequence\} 日/)
  assert.match(pdfRoute, /\.page-start \{ break-before:page; page-break-before:always;/)
  assert.match(pdfRoute, /\.period-daily-block \{ break-inside:avoid-page; page-break-inside:avoid;/)
  assert.match(pdfRoute, /\.action \{ break-inside:avoid-page; page-break-inside:avoid;/)
  assert.match(submittedView, /WeeklyRevenueComparison/)
  assert.match(editView, /WeeklyRevenueComparison/)
})

test('單張照片使用較大的完整照片版位', () => {
  assert.equal(photoGridClass(1), 'photos photos-single')
  assert.equal(photoGridClass(2), 'photos')
})

test('PDF 依內容量選擇可讀的字體與段落密度', () => {
  assert.equal(choosePdfDensity({ dailyRowCount: 14, entryCount: 1, photoCount: 0, textLength: 200 }), 'comfortable')
  assert.equal(choosePdfDensity({ dailyRowCount: 28, entryCount: 2, photoCount: 2, textLength: 500 }), 'balanced')
  assert.equal(choosePdfDensity({ dailyRowCount: 28, entryCount: 6, photoCount: 6, textLength: 1000 }), 'dense')
})
