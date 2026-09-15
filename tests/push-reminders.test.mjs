import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const reminders = fs.readFileSync(new URL('../lib/scheduled-push-reminders.ts', import.meta.url), 'utf8')
const notifications = fs.readFileSync(new URL('../lib/push-notifications.ts', import.meta.url), 'utf8')
const ckActions = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const cronRoute = fs.readFileSync(new URL('../app/api/cron/push-reminders/[kind]/route.ts', import.meta.url), 'utf8')
const storeEditor = fs.readFileSync(new URL('../components/hq/store-editor.tsx', import.meta.url), 'utf8')
const scheduleForm = fs.readFileSync(new URL('../components/hq/push-schedule-settings-form.tsx', import.meta.url), 'utf8')
const scheduleAction = fs.readFileSync(new URL('../app/actions/push-management.ts', import.meta.url), 'utf8')
const scheduleMigration = fs.readFileSync(new URL('../supabase/migrations/072_push_schedule_settings.sql', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('店面與央廚未送出帳目會依總公司設定時間各提醒一次', () => {
  assert.match(reminders, /shouldTrackStoreAccountingDate\(businessDate, store\.created_at\)/)
  assert.match(reminders, /holidayStoreIds\.has\(id\)/)
  assert.match(reminders, /status === 'submitted' \|\| status === 'verified'/)
  assert.match(reminders, /sentReminderKeys\(`accounting-\$\{stage\}`, businessDate\)/)
  assert.match(notifications, /title: isFinal \? '第二次提醒：帳目尚未送出' : '今晚帳目尚未送出'/)
  assert.match(cronRoute, /sendAccountingSubmissionReminders\('first', schedule\.accountingFirstTime\)/)
  assert.match(cronRoute, /sendAccountingSubmissionReminders\('final', schedule\.accountingFinalTime\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/scheduled') && cron.schedule === '*/5 * * * *'))
})

test('總公司送出補款後立即通知央廚，並在總公司設定時間再次提醒', () => {
  assert.match(ckActions, /notifyCKUsersOfReimbursementHandoff/)
  assert.match(ckActions, /stage: 'received'/)
  assert.match(reminders, /\.eq\('hq_paid', true\)/)
  assert.match(reminders, /\.eq\('ck_reimbursement_confirmed', false\)/)
  assert.match(reminders, /stage: 'reminder'/)
  assert.match(reminders, /String\(record\.hq_reimbursement_sent_at\)/)
  assert.match(cronRoute, /sendCKReimbursementHandoffReminders\(schedule\.ckHandoffTime\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/scheduled') && cron.schedule === '*/5 * * * *'))
})

test('推播提醒排程有密鑰保護，並受店家與個人推播開關控制', () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/)
  assert.match(notifications, /store\?\.push_notifications_enabled !== false/)
  assert.match(notifications, /profile\.push_notifications_enabled !== false/)
  assert.match(notifications, /storeUserIds\(input\.storeId/)
  assert.match(storeEditor, /接收帳務提醒與審核結果通知/)
})

test('第二次未送出、央廚未點交與退回逾時會升級通知總公司', () => {
  assert.match(reminders, /stage === 'final'[\s\S]*notifyReviewersOfEscalation/)
  assert.match(reminders, /央廚補款仍未點交/)
  assert.match(reminders, /export async function sendReturnedAccountingReminders/)
  assert.match(reminders, /Date\.now\(\) - delayMinutes \* 60000/)
  assert.match(reminders, /sentReminderKeys\('returned-60m'\)/)
  assert.match(cronRoute, /sendReturnedAccountingReminders\(schedule\.returnedReminderMinutes\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/returned') && cron.schedule === '*/15 * * * *'))
})

test('推播管理頁可由總公司設定所有業務提醒時間', () => {
  assert.match(scheduleForm, /帳目未送出・第一次提醒/)
  assert.match(scheduleForm, /帳目未送出・第二次提醒/)
  assert.match(scheduleForm, /央廚補款尚未點交/)
  assert.match(scheduleForm, /帳目退回仍未修改/)
  assert.match(scheduleForm, /type="time"/)
  assert.match(scheduleAction, /canManageUsers\(profile\)/)
  assert.match(scheduleAction, /validatePushScheduleSettings\(input\)/)
  assert.match(scheduleMigration, /create table if not exists push_schedule_settings/)
  assert.match(scheduleMigration, /revoke all on table push_schedule_settings from anon, authenticated/)
  assert.match(cronRoute, /checks\.filter\(check => isPushScheduleDue\(check\.time\)\)/)
})

test('推播重試排程每五分鐘處理一次', () => {
  assert.match(cronRoute, /processPendingPushJobs\(200\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/delivery-retry') && cron.schedule === '*/5 * * * *'))
})
