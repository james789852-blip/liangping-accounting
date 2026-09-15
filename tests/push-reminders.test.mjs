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
const reliabilityMigration = fs.readFileSync(new URL('../supabase/migrations/074_push_reliability.sql', import.meta.url), 'utf8')
const scheduleRuns = fs.readFileSync(new URL('../lib/push-schedule-runs.ts', import.meta.url), 'utf8')
const pushAdminPage = fs.readFileSync(new URL('../app/hq/notifications/page.tsx', import.meta.url), 'utf8')
const userActions = fs.readFileSync(new URL('../app/actions/users.ts', import.meta.url), 'utf8')
const permissionCleanupMigration = fs.readFileSync(new URL('../supabase/migrations/076_normalize_non_hq_permissions.sql', import.meta.url), 'utf8')
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('店面與央廚未送出帳目會依總公司設定時間各提醒一次', () => {
  assert.match(reminders, /shouldTrackStoreAccountingDate\(businessDate, store\.created_at\)/)
  assert.match(reminders, /holidayStoreIds\.has\(id\)/)
  assert.match(reminders, /status === 'submitted' \|\| status === 'verified'/)
  assert.match(reminders, /sentReminderKeys\(`accounting-\$\{stage\}`, businessDate\)/)
  assert.match(notifications, /帳目\$\{wasReturned \? '退回待重送' : '尚未送出'\}（第\$\{isFinal \? '2' : '1'\}次提醒）/)
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
  assert.match(cronRoute, /runScheduledPush\(\{/)
})

test('排程錯過五分鐘時段會補跑並記錄上次、下次與投遞成果', () => {
  assert.match(reliabilityMigration, /create table if not exists push_schedule_runs/)
  assert.match(scheduleRuns, /status === 'succeeded'/)
  assert.match(scheduleRuns, /status: 'failed'/)
  assert.match(scheduleRuns, /notifyPushSystemAdministrators/)
  assert.match(pushAdminPage, /排程執行健檢/)
  assert.match(pushAdminPage, /上次執行/)
  assert.match(pushAdminPage, /下次執行／上次成果/)
})

test('一般送審三分鐘內合併，退回重送仍立即通知', () => {
  assert.match(reliabilityMigration, /create table if not exists push_submission_digest_items/)
  assert.match(notifications, /if \(!input\.wasReturned\)/)
  assert.match(notifications, /Date\.now\(\) - 3 \* 60000/)
  assert.match(notifications, /buildPendingReviewNotification\(hydratedItems\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/submission-digest') && cron.schedule === '* * * * *'))
})

test('推播管理頁顯示裝置未綁定、久未連線、失敗與各單位完成率', () => {
  assert.match(pushAdminPage, /裝置綁定健檢/)
  assert.match(pushAdminPage, /尚未綁定 · \$\{unbound\.length\} 人/)
  assert.match(pushAdminPage, /unbound\.map\(account => <p key=\{account\.user_id\}>\{account\.name\}<\/p>\)/)
  assert.doesNotMatch(pushAdminPage, /healthGroup: group\.label/)
  assert.match(pushAdminPage, /超過 7 天未連線/)
  assert.match(pushAdminPage, /連續推播失敗/)
  assert.match(pushAdminPage, /綁定完成率/)
  assert.match(pushAdminPage, /account\.is_hq === true \|\| isBoss\(account\)/)
  assert.match(pushAdminPage, /resolvePrimaryStoreId\(account, activeStoreIds\)/)
  assert.doesNotMatch(pushAdminPage, /hasAnyHQPermission\(account\)/)
})

test('已綁定裝置依總公司、各店面與各央廚分組並可展開', () => {
  assert.match(pushAdminPage, /const deviceGroups = \[/)
  assert.match(pushAdminPage, /resolvePrimaryStoreId\(account, activeStoreIds\)/)
  assert.match(pushAdminPage, /label: '總公司', Icon: Building2/)
  assert.match(pushAdminPage, /label: '店面', Icon: StoreIcon/)
  assert.match(pushAdminPage, /label: '央廚', Icon: ChefHat/)
  assert.match(pushAdminPage, /<details key=\{group\.key\}/)
  assert.match(pushAdminPage, /\{group\.label\}/)
  assert.match(pushAdminPage, /\{group\.devices\.length\} 台・點選展開/)
})

test('非總公司帳號不保留隱藏的總公司管理權限', () => {
  assert.match(userActions, /if \(!nextIsHQ\) clearHQPermissions\(patch\)/)
  assert.match(permissionCleanupMigration, /where coalesce\(is_hq, false\) = false/)
  assert.match(permissionCleanupMigration, /can_manage_ck_settings = false/)
})

test('推播重試排程每五分鐘處理一次', () => {
  assert.match(cronRoute, /processPendingPushJobs\(200\)/)
  assert.ok(vercelConfig.crons.some(cron => cron.path.endsWith('/delivery-retry') && cron.schedule === '*/5 * * * *'))
})
