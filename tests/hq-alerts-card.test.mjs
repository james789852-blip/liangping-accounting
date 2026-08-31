import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const alertsSource = readFileSync(new URL('../components/hq/hq-alerts-card.tsx', import.meta.url), 'utf8')
const accountingSource = readFileSync(new URL('../components/hq/accounting-client.tsx', import.meta.url), 'utf8')
const closingsSource = readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')

test('逾期提醒的狀態摘要會前往最早一筆對應帳目', () => {
  assert.match(alertsSource, /const oldestItem = group\.items\[0\]/)
  assert.match(alertsSource, /aria-label={`前往最早一筆\$\{overdueStatusLabel\[group\.status\]\}帳目/)
  assert.match(alertsSource, /href={href}/)
  assert.match(alertsSource, /function overdueItemHref\(item: OverdueAlert\)/)
})

test('審核狀態改變後會重新查詢逾期提醒', () => {
  assert.match(accountingSource, /<HQAlertsCard refreshKey={alertsRefreshKey} \/>/)
  assert.match(alertsSource, /\[refreshAlerts, refreshKey\]/)
  assert.match(closingsSource, /revalidatePath\('\/hq\/accounting'\)/)
})
