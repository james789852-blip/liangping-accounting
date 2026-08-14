import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { calculateClosingSummary } from '../lib/closing-summary.ts'
import { deriveHistoricalExcelLedgerRow } from '../lib/export-reconciliation.ts'

const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/historical-excel-ledger.json', import.meta.url), 'utf8'),
)

for (const fixture of fixtures) {
  test(`歷史 Excel 固定答案：${fixture.case}`, () => {
    assert.deepEqual(
      deriveHistoricalExcelLedgerRow(fixture.input),
      fixture.expected,
      `${fixture.source.workbook} / ${fixture.source.sheet} / ${fixture.source.cells}`,
    )
  })
}

function blankRevenue(overrides = {}) {
  return {
    pos_cash: 0,
    uber_amounts: {},
    panda_amount: 0,
    twpay_amount: 0,
    online_amount: 0,
    online_cash_amount: 0,
    bills_1000: 0,
    bills_500: 0,
    bills_100: 0,
    coins_50: 0,
    coins_10: 0,
    coins_5: 0,
    coins_1: 0,
    lump_1000: 0,
    lump_500: 0,
    lump_100: 0,
    lump_50: 0,
    lump_10: 0,
    lump_5: 0,
    lump_1: 0,
    ...overrides,
  }
}

test('正式店面結帳：平台現金、顧客轉帳與現金清點只計算一次', () => {
  const result = calculateClosingSummary({
    revenue: blankRevenue({
      pos_cash: 31_790,
      uber_amounts: { 主帳號: 12_569 },
      online_amount: 28_100,
      online_cash_amount: -10_535,
      bills_1000: 67,
      bills_500: 6,
      bills_100: 5,
      coins_50: 4,
      coins_10: 8,
      coins_5: 3,
      coins_1: 4,
    }),
    store: { ichef_uber_linked: false, petty_cash: 50_000 },
    totalExpenses: 14_450,
    handwriteTotal: 0,
    deliveryFee: 28_190,
    adjustments: [{ type: 'customer_transfer', amount: -2_875 }],
    reserves: [],
    largeCashExpenses: [],
  })

  assert.equal(result.totalRevenue, 72_459)
  assert.equal(result.platformPaid, 30_134)
  assert.equal(result.shouldEnvelope, 27_875)
  assert.equal(result.cashSubtotal, 70_799)
  assert.equal(result.actualRemit, 23_674)
  assert.equal(result.finalRemit, 20_799)
})

test('正式店面結帳：前日預留的大額支出只在最後包回時加回', () => {
  const result = calculateClosingSummary({
    revenue: blankRevenue({ pos_cash: 100_000, bills_1000: 120 }),
    store: { ichef_uber_linked: true, petty_cash: 50_000 },
    totalExpenses: 30_000,
    handwriteTotal: 0,
    deliveryFee: 0,
    adjustments: [],
    reserves: [],
    largeCashExpenses: [{ amount: 20_000, preReserved: true }],
  })

  assert.equal(result.cashSubtotal, 120_000)
  assert.equal(result.cashTotal, 100_000)
  assert.equal(result.actualRemit, 50_000)
  assert.equal(result.preReservedExpenseTotal, 20_000)
  assert.equal(result.remitToHQ, 70_000)
})
