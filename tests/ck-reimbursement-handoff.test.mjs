import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS,
  formatCKReimbursementCountdown,
  getCKReimbursementAutoConfirmAt,
  getCKReimbursementRemainingMs,
  isCKReimbursementExpired,
} from '../lib/ck-reimbursement-handoff-deadline.ts'

const handoffModule = fs.readFileSync(new URL('../lib/ck-reimbursement-handoff.ts', import.meta.url), 'utf8')
const handoffCron = fs.readFileSync(new URL('../app/api/cron/auto-complete-ck-handoffs/route.ts', import.meta.url), 'utf8')
const dashboardPage = fs.readFileSync(new URL('../app/manager/dashboard/page.tsx', import.meta.url), 'utf8')
const ckPage = fs.readFileSync(new URL('../app/manager/ck/page.tsx', import.meta.url), 'utf8')
const handoffCard = fs.readFileSync(new URL('../components/manager/ck-reimbursement-handoff-card.tsx', import.meta.url), 'utf8')
const ckDoneCard = fs.readFileSync(new URL('../components/manager/ck-daily-form.tsx', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('總公司送出補款後滿 24 小時才會自動點交', () => {
  const sentAt = '2026-09-10T01:23:45.000Z'
  assert.equal(CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS, 24)
  assert.equal(getCKReimbursementAutoConfirmAt(sentAt), '2026-09-11T01:23:45.000Z')
  assert.equal(isCKReimbursementExpired(sentAt, new Date('2026-09-11T01:23:44.999Z')), false)
  assert.equal(isCKReimbursementExpired(sentAt, new Date('2026-09-11T01:23:45.000Z')), true)
  assert.equal(isCKReimbursementExpired(null), false)
  assert.equal(getCKReimbursementAutoConfirmAt('invalid'), null)
})

test('點交頁即時顯示 24 小時倒數並在到期時歸零', () => {
  const sentAt = '2026-09-10T01:00:00.000Z'
  assert.equal(getCKReimbursementRemainingMs(sentAt, new Date('2026-09-10T02:02:57.000Z')), 82_623_000)
  assert.equal(formatCKReimbursementCountdown(82_623_000), '剩餘 22:57:03')
  assert.equal(formatCKReimbursementCountdown(0), '正在自動完成點交…')
  assert.match(handoffCard, /最後 6 小時/)
  assert.match(handoffCard, /router\.refresh\(\)/)
})

test('自動點交只更新已送出、未點交且超過期限的央廚補款', () => {
  assert.match(handoffModule, /\.eq\('hq_paid', true\)/)
  assert.match(handoffModule, /\.eq\('ck_reimbursement_confirmed', false\)/)
  assert.match(handoffModule, /\.lte\('hq_reimbursement_sent_at', cutoff\)/)
  assert.match(handoffModule, /ck_reimbursement_confirmed_by: null/)
  assert.match(handoffModule, /confirmation_method: 'automatic_24h'/)
})

test('排程與央廚頁面都會補判定逾期點交', () => {
  assert.match(handoffCron, /process\.env\.CRON_SECRET/)
  assert.match(handoffCron, /await autoCompleteExpiredCKReimbursementHandoffs\(\)/)
  assert.ok(vercelConfig.crons.some(cron => (
    cron.path === '/api/cron/auto-complete-ck-handoffs' && cron.schedule === '*/5 * * * *'
  )))
  assert.match(dashboardPage, /await autoCompleteExpiredCKReimbursementHandoffs\(\{ ckStoreId: storeId \}\)/)
  assert.match(ckPage, /await autoCompleteExpiredCKReimbursementHandoffs\(\{ ckStoreId: storeId \}\)/)
})

test('央廚待點交與完成頁會清楚顯示 24 小時規則及自動點交來源', () => {
  assert.match(handoffCard, /請在 24 小時內完成點交/)
  assert.match(handoffCard, /逾時系統將自動完成/)
  assert.match(ckDoneCard, /補款已由系統自動完成點交/)
  assert.match(ckDoneCard, /自動點交時間/)
})
