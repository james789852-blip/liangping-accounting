import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReserveHistoryContext } from '../lib/reserve-history.ts'
import { prepareReserveDraftItems } from '../lib/reserve-draft.ts'

test('後續日期的同名足額支出會核銷歷史預留款提醒', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-08-15',
      reserve_items: [],
      expense_items: [{ description: '房租', amount: 90_000 }],
    },
    {
      business_date: '2026-08-13',
      reserve_items: [{ reason: '房租', amount: 22_170 }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result, {
    prevDayReserves: null,
    preReservedExpenseHints: [],
  })
})

test('舊版把尚差金額存成新帳單總額時仍接續同一期並在付款後結清', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-07-20',
      reserve_items: [],
      expense_items: [{ description: '電費', amount: 42_709 }],
    },
    {
      business_date: '2026-07-18',
      reserve_items: [{ reason: '電費', amount: 24_054, total_bill: 24_054 }],
      expense_items: [],
    },
    {
      business_date: '2026-07-17',
      reserve_items: [{ reason: '電費', amount: 18_655, total_bill: 42_709 }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result, {
    prevDayReserves: null,
    preReservedExpenseHints: [],
  })
})

test('尚未出現對應支出時仍保留預留款提醒', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-08-13',
      reserve_items: [{ reason: '房租', amount: 22_170 }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result.preReservedExpenseHints, [{
    reason: '房租',
    description: undefined,
    amount: 22_170,
    reference_id: 'legacy-loose:房租',
    started_date: '2026-08-13',
  }])
})

test('隔日沒有預留時不會憑空增加金額，後續手動預留可接續同一帳單', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-08-17',
      reserve_items: [{ reason: '電費', amount: 1_364, total_bill: 43_649 }],
      expense_items: [],
    },
    {
      business_date: '2026-08-16',
      reserve_items: [{ reason: '電費', amount: 24_945, total_bill: 43_649 }],
      expense_items: [],
    },
    {
      business_date: '2026-08-15',
      reserve_items: [],
      expense_items: [],
    },
    {
      business_date: '2026-08-13',
      reserve_items: [{ reason: '電費', amount: 17_340, total_bill: 43_649 }],
      expense_items: [],
    },
  ])

  assert.equal(result.prevDayReserves, null)
  assert.deepEqual(result.preReservedExpenseHints, [
    {
      reason: '電費',
      description: undefined,
      amount: 43_649,
      total_bill: 43_649,
      reference_id: 'legacy:2026-08-13:電費:43649',
      started_date: '2026-08-13',
    },
  ])
})

test('實際支出用預留款識別碼核銷，名稱不同也不會留下提醒', () => {
  const result = buildReserveHistoryContext([
    {
      business_date: '2026-09-14',
      reserve_items: [],
      expense_items: [{ description: '7–8 月營業稅', amount: 90_486 }],
      cash_counts: [{
        large_expenses: [{
          description: '7–8 月營業稅',
          amount: 90_486,
          preReserved: true,
          reserveReferenceId: 'tax-2026-09',
          reserveReason: '營業稅',
        }],
      }],
    },
    {
      business_date: '2026-09-12',
      reserve_items: [{
        reason: '營業稅',
        description: '7–8 月份',
        amount: 90_486,
        total_bill: 90_486,
        reserve_reference_id: 'tax-2026-09',
        source_start_date: '2026-09-12',
      }],
      expense_items: [],
    },
  ])

  assert.deepEqual(result, { prevDayReserves: null, preReservedExpenseHints: [] })
})

test('未結清提醒不會自動替店長建立預留款', () => {
  const context = {
    business_date: '2026-08-13',
    items: [{
      reason: '電費',
      amount: 17_340,
      total_bill: 43_649,
      started_date: '2026-08-13',
      remaining_amount: 26_309,
    }],
  }

  assert.deepEqual(prepareReserveDraftItems([], context), [])
})

test('後續預留會沿用同一筆帳單的說明與識別碼', () => {
  const context = {
    business_date: '2026-09-12',
    items: [{
      reason: '營業稅',
      description: '7–8 月營業稅',
      amount: 38_920,
      total_bill: 90_486,
      started_date: '2026-09-12',
      remaining_amount: 51_566,
      reserve_reference_id: 'tax-2026-09',
    }],
  }

  assert.deepEqual(prepareReserveDraftItems([
    {
      id: 'today',
      reason: '營業稅',
      amount: 51_566,
      total_bill: 90_486,
      reserve_reference_id: 'tax-2026-09',
    },
  ], context), [{
    id: 'today',
    reason: '營業稅',
    description: '7–8 月營業稅',
    amount: 51_566,
    total_bill: 90_486,
    source_start_date: '2026-09-12',
    accumulated_before: 38_920,
    reserve_reference_id: 'tax-2026-09',
  }])
})

test('可編輯草稿會移除舊版自動預留，只保留店長手動項目', () => {
  const result = prepareReserveDraftItems([
    { id: 'auto', reason: '電費', amount: 20_862, auto_reserved: true },
    { id: 'manual', reason: '房租', amount: 10_000 },
  ])

  assert.deepEqual(result, [{ id: 'manual', reason: '房租', amount: 10_000 }])
})
