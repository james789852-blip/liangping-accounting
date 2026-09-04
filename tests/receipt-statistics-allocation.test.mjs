import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { allocateReceiptStatistics, TAX_EXEMPT_RICE_GROUP } from '../lib/receipt-statistics-allocation.ts'

const hqDashboardSource = readFileSync(new URL('../app/hq/dashboard/page.tsx', import.meta.url), 'utf8')
const managerAnalyticsSource = readFileSync(new URL('../app/manager/analytics/client.tsx', import.meta.url), 'utf8')

test('雜貨中的米會拆成免稅統計且不改變單據總額', () => {
  const allocations = allocateReceiptStatistics('雜貨', 4_870, [
    { item_name: '米', amount: 3_900 },
    { item_name: '咖哩-佛蒙特', amount: 250 },
    { item_name: '咖哩-爪哇', amount: 500 },
    { item_name: '萬家香', amount: 220 },
  ])

  assert.deepEqual(allocations, [
    { group: '雜貨', amount: 970, itemNames: ['咖哩-佛蒙特', '咖哩-爪哇', '萬家香'] },
    { group: TAX_EXEMPT_RICE_GROUP, amount: 3_900, itemNames: ['米'] },
  ])
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.amount, 0), 4_870)
})

test('全為米的雜貨單只顯示米免稅統計', () => {
  assert.deepEqual(
    allocateReceiptStatistics('雜貨', 3_900, [{ item_name: '米', amount: 3_900 }]),
    [{ group: TAX_EXEMPT_RICE_GROUP, amount: 3_900, itemNames: ['米'] }],
  )
})

test('非雜貨或沒有米的單據維持原分類與金額', () => {
  assert.deepEqual(
    allocateReceiptStatistics('免洗', 700, [{ item_name: '廚房紙巾', amount: 700 }]),
    [{ group: '免洗', amount: 700, itemNames: ['廚房紙巾'] }],
  )
  assert.deepEqual(
    allocateReceiptStatistics('雜貨', 750, [{ item_name: '咖哩', amount: 750 }]),
    [{ group: '雜貨', amount: 750, itemNames: ['咖哩'] }],
  )
})

test('景新8月雜貨拆分為米78000與其他雜貨24600', () => {
  const itemTotals = [
    { item_name: '米', amount: 78_000 },
    { item_name: '咖哩-佛蒙特', amount: 6_750 },
    { item_name: '咖哩-爪哇', amount: 13_500 },
    { item_name: '萬家香', amount: 3_300 },
    { item_name: '沙拉油', amount: 940 },
    { item_name: '白胡椒', amount: 110 },
  ]
  const allocations = allocateReceiptStatistics('雜貨', 102_600, itemTotals)

  assert.equal(allocations.find(row => row.group === TAX_EXEMPT_RICE_GROUP)?.amount, 78_000)
  assert.equal(allocations.find(row => row.group === '雜貨')?.amount, 24_600)
  assert.equal(allocations.reduce((sum, row) => sum + row.amount, 0), 102_600)
})

test('米免稅統計放在雜貨展開明細，且不重複計算單據筆數', () => {
  assert.match(hqDashboardSource, /receipt_items\(item_name, amount\)/)
  assert.match(hqDashboardSource, /allocateReceiptStatistics\(sourceGroup, amount, receipt\.receipt_items\)/)
  assert.match(hqDashboardSource, /group: sourceGroup/)
  assert.match(hqDashboardSource, /detailName = allocation\.group === TAX_EXEMPT_RICE_GROUP/)
  assert.match(managerAnalyticsSource, /allocateReceiptStatistics\(sourceGroup, Number\(receipt\.total_amount \?\? 0\), receipt\.receipt_items\)/)
  assert.match(managerAnalyticsSource, /currentCounts\.set\(sourceGroup/)
  assert.match(managerAnalyticsSource, /count: currentCounts\.get\(name\) \?\? 0/)
  assert.match(managerAnalyticsSource, /const vendorReceiptCount = currentReceiptCount/)
})
