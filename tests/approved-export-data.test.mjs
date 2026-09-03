import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const storeAggregator = fs.readFileSync(new URL('../lib/store-aggregator.ts', import.meta.url), 'utf8')
const ckAggregator = fs.readFileSync(new URL('../lib/ck-aggregator.ts', import.meta.url), 'utf8')
const storeWorkbook = fs.readFileSync(new URL('../lib/food-cost-native-workbook.ts', import.meta.url), 'utf8')
const ckWorkbook = fs.readFileSync(new URL('../lib/ck-native-workbook.ts', import.meta.url), 'utf8')
const sheets = fs.readFileSync(new URL('../lib/google-sheets.ts', import.meta.url), 'utf8')
const closingActions = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
const ckActions = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const storeCsv = fs.readFileSync(new URL('../app/api/export/food-cost-csv/route.ts', import.meta.url), 'utf8')
const ckCsv = fs.readFileSync(new URL('../app/api/export/ck-csv/route.ts', import.meta.url), 'utf8')
const legacyCkExport = fs.readFileSync(new URL('../app/api/export/ck/route.ts', import.meta.url), 'utf8')

test('店面正式報表只查詢已核准帳目，且草稿收據不會單獨流入', () => {
  assert.match(storeAggregator, /if \(scope\.verifiedOnly\) closingsQuery = closingsQuery\.eq\('status', 'verified'\)/)
  assert.match(storeAggregator, /if \(scope\.verifiedOnly && !byDate\[r\.business_date\]\) continue/)
  assert.ok((storeWorkbook.match(/\{ verifiedOnly: true \}/g) ?? []).length >= 3)
  assert.match(storeCsv, /getMonthlyStats\(storeId, year, monthNum, \{ verifiedOnly: true \}\)/)
})

test('央廚正式報表與舊版匯出也只查詢已核准帳目', () => {
  assert.match(ckAggregator, /if \(scope\.verifiedOnly\) recordsQuery = recordsQuery\.eq\('status', 'verified'\)/)
  assert.ok((ckWorkbook.match(/\{ verifiedOnly: true \}/g) ?? []).length >= 3)
  assert.match(ckCsv, /getCKMonthlyStats\(storeId, year, monthNum, \{ verifiedOnly: true \}\)/)
  assert.match(legacyCkExport, /\.eq\('status', 'verified'\)/)
  assert.match(ckWorkbook, /const isApprovedDay = dd\?\.status === 'verified'/)
  assert.match(ckWorkbook, /c\.kind === 'stat' && c\.statKey && isApprovedDay/)
  assert.doesNotMatch(ckWorkbook, /c\.kind === 'member' && dd/)
})

test('單筆同步入口拒絕尚未核准的店面帳目', () => {
  assert.match(sheets, /select\('store_id, business_date, status'\)/)
  assert.match(sheets, /if \(!closing \|\| closing\.status !== 'verified'\) return/)
})

test('已核准帳目退回時會重建試算表並移除該日資料', () => {
  const verifySource = closingActions.slice(
    closingActions.indexOf('export async function verifyClosing'),
    closingActions.indexOf('export async function verifyClosingsBatch'),
  )
  const disputeSource = closingActions.slice(closingActions.indexOf('export async function disputeClosing'))

  assert.doesNotMatch(verifySource, /\[disputeClosing\]/)
  assert.match(disputeSource, /if \(closing\.status === 'verified'\) \{\s*after\(async \(\) => \{\s*try \{\s*await syncMonthToSheets/)
  assert.match(ckActions, /if \(decision === 'verified' \|\| existing\.status === 'verified'\)/)
  assert.match(ckActions, /decision === 'verified' \? '核准後' : '退回後'/)
})
