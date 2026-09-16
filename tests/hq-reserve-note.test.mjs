import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { formatReserveDisplayLabel } from '../lib/reserve-display.ts'

const reviewCard = fs.readFileSync(new URL('../components/hq/review-card.tsx', import.meta.url), 'utf8')
const accountingClient = fs.readFileSync(new URL('../components/hq/accounting-client.tsx', import.meta.url), 'utf8')
const closingsBrowser = fs.readFileSync(new URL('../components/hq/closings-browser.tsx', import.meta.url), 'utf8')

test('預留其他會在總公司畫面顯示店長填寫的備註', () => {
  assert.equal(
    formatReserveDisplayLabel({ reason: '其他', description: '支付府中店冷氣維修' }),
    '預留 其他｜備註：支付府中店冷氣維修',
  )
})

test('預留款沒有備註時維持簡潔名稱，並整理空白文字', () => {
  assert.equal(formatReserveDisplayLabel({ reason: ' 房租 ', description: '  ' }), '預留 房租')
  assert.equal(formatReserveDisplayLabel({}), '預留 款項')
})

test('總公司逐張審核、帳目摘要與歷史帳目都使用含備註的顯示格式', () => {
  for (const source of [reviewCard, accountingClient, closingsBrowser]) {
    assert.match(source, /formatReserveDisplayLabel/)
    assert.match(source, /description\?: string/)
  }
  assert.match(reviewCard, /label=\{formatReserveDisplayLabel\(item, '預留：'\)\}/)
  assert.match(reviewCard, /🐷 \{formatReserveDisplayLabel\(r\)\}/)
  assert.match(reviewCard, /key=\{`final-reserve-\$\{i\}`\}[\s\S]*?formatReserveDisplayLabel\(item, '預留：'\)/)
})
