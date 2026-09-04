import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { resolveCentralKitchenStatisticsVendor } from '../lib/ck-statistics-vendor.ts'

const hqDashboardSource = readFileSync(new URL('../app/hq/dashboard/page.tsx', import.meta.url), 'utf8')

test('央廚廠商分類以品項名稱作為實際廠商', () => {
  assert.equal(resolveCentralKitchenStatisticsVendor('廠商', '順正'), '順正')
  assert.equal(resolveCentralKitchenStatisticsVendor('廠商', ' 淳香 '), '淳香')
  assert.equal(resolveCentralKitchenStatisticsVendor('廠商', ''), '未指定廠商')
})

test('央廚非廠商分類不會把一般品項誤列成廠商', () => {
  assert.equal(resolveCentralKitchenStatisticsVendor('雜項', '水費'), '')
  assert.equal(resolveCentralKitchenStatisticsVendor('耗材', '加油錢'), '')
})

test('總公司統計中心會依央廚實際廠商累計筆數與金額', () => {
  assert.match(hqDashboardSource, /resolveCentralKitchenStatisticsVendor\(category, expense\.items\[0\]\)/)
  assert.match(hqDashboardSource, /row\.vendorMap\.get\(actualVendor\)/)
  assert.match(hqDashboardSource, /detail\.total \+= expense\.amount/)
  assert.match(hqDashboardSource, /detail\.count \+= 1/)
  assert.match(hqDashboardSource, /row\.vendorMap\.set\(actualVendor, detail\)/)
})
