import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { fetchAllPaged } from '../lib/supabase-paged.ts'

const dashboardSource = readFileSync(new URL('../app/hq/dashboard/page.tsx', import.meta.url), 'utf8')

test('分頁工具會讀完超過 PostgREST 1000 筆上限的資料', async () => {
  const rows = Array.from({ length: 2_350 }, (_, index) => ({ id: index + 1 }))
  const requestedRanges = []

  const result = await fetchAllPaged(() => ({
    async range(from, to) {
      requestedRanges.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    },
  }))

  assert.equal(result.length, 2_350)
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999], [2000, 2999]])
  assert.equal(result.at(-1)?.id, 2_350)
})

test('總公司統計中心的店面與央廚明細都必須使用全量分頁', () => {
  for (const table of ['daily_closings', 'receipts', 'ck_daily_records', 'ck_store_orders', 'ck_expense_items']) {
    assert.match(
      dashboardSource,
      new RegExp(`fetchAllPaged<any>\\(\\(\\) => admin\\.from\\('${table}'\\)`),
      `${table} 未使用全量分頁`,
    )
  }
})
