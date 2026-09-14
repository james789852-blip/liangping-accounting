import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const reminders = fs.readFileSync(new URL('../lib/scheduled-push-reminders.ts', import.meta.url), 'utf8')
const notifications = fs.readFileSync(new URL('../lib/push-notifications.ts', import.meta.url), 'utf8')
const ckActions = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const cronRoute = fs.readFileSync(new URL('../app/api/cron/push-reminders/[kind]/route.ts', import.meta.url), 'utf8')
const storeEditor = fs.readFileSync(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('店面與央廚未送出帳目會在台北時間 23:00、23:30 各提醒一次', () => {
  assert.match(reminders, /shouldTrackStoreAccountingDate\(businessDate, store\.created_at\)/)
  assert.match(reminders, /holidayStoreIds\.has\(id\)/)
  assert.match(reminders, /status === 'submitted' \|\| status === 'verified'/)
  assert.match(reminders, /sentReminderKeys\(`accounting-\$\{stage\}`, businessDate\)/)
  assert.match(notifications, /title: isFinal \? '第二次提醒：帳目尚未送出' : '今晚帳目尚未送出'/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/accounting-first') && cron.schedule === '0 15 * * *'))
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/accounting-final') && cron.schedule === '30 15 * * *'))
})

test('總公司送出補款後立即通知央廚，17:00 尚未點交再提醒一次', () => {
  assert.match(ckActions, /notifyCKUsersOfReimbursementHandoff/)
  assert.match(ckActions, /stage: 'received'/)
  assert.match(reminders, /\.eq\('hq_paid', true\)/)
  assert.match(reminders, /\.eq\('ck_reimbursement_confirmed', false\)/)
  assert.match(reminders, /stage: '17:00'/)
  assert.match(reminders, /String\(record\.hq_reimbursement_sent_at\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/ck-handoff') && cron.schedule === '0 9 * * *'))
})

test('推播提醒排程有密鑰保護，並受店家與個人推播開關控制', () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/)
  assert.match(notifications, /store\?\.push_notifications_enabled === false/)
  assert.match(notifications, /storeUserIds\(input\.storeId\)/)
  assert.match(storeEditor, /接收帳務提醒與審核結果通知/)
})
