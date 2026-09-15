import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync(new URL('../supabase/migrations/073_hq_notification_followups.sql', import.meta.url), 'utf8')
const actions = fs.readFileSync(new URL('../app/actions/notifications.ts', import.meta.url), 'utf8')
const center = fs.readFileSync(new URL('../components/notification-center.tsx', import.meta.url), 'utf8')
const adminPage = fs.readFileSync(new URL('../app/hq/notifications/page.tsx', import.meta.url), 'utf8')
const followUps = fs.readFileSync(new URL('../lib/hq-notification-followups.ts', import.meta.url), 'utf8')
const reminders = fs.readFileSync(new URL('../lib/scheduled-push-reminders.ts', import.meta.url), 'utf8')
const cronRoute = fs.readFileSync(new URL('../app/api/cron/push-reminders/[kind]/route.ts', import.meta.url), 'utf8')
const closingActions = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
const ckActions = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')

test('總公司三種異常推播都會建立共用追蹤案件', () => {
  assert.match(migration, /create table if not exists hq_notification_followups/)
  assert.match(migration, /'accounting_missing', 'returned_accounting', 'ck_handoff'/)
  assert.match(migration, /unique/)
  assert.match(reminders, /kind: 'accounting_missing'/)
  assert.match(reminders, /kind: 'returned_accounting'/)
  assert.match(reminders, /kind: 'ck_handoff'/)
})

test('只有審核人員能接手，且第一位接手者會以條件更新鎖定', () => {
  assert.match(actions, /canReviewClosings\(profile as PermissionProfile\)/)
  assert.match(actions, /export async function claimHQNotificationFollowUp/)
  assert.match(actions, /\.eq\('status', 'pending'\)[\s\S]*\.is\('claimed_by', null\)/)
  assert.match(actions, /export async function releaseHQNotificationFollowUp/)
  assert.match(actions, /\.eq\('claimed_by', user\.id\)/)
})

test('通知中心與推播管理會顯示待處理、處理人與已完成', () => {
  assert.match(center, /我來處理/)
  assert.match(center, /處理中/)
  assert.match(center, /取消接手/)
  assert.match(center, /已完成/)
  assert.match(center, /activeFollowUps/)
  assert.match(actions, /missingSourceKeys/)
  assert.match(adminPage, /追蹤狀態：待處理/)
  assert.match(adminPage, /總公司人員.*處理中/)
  assert.match(adminPage, /追蹤狀態：已完成/)
})

test('底層問題解除後，五分鐘排程會自動完成追蹤案件', () => {
  assert.match(followUps, /export async function resolveCompletedHQNotificationFollowUps/)
  assert.match(followUps, /record\?\.status === 'submitted' \|\| record\?\.status === 'verified'/)
  assert.match(followUps, /data\.status !== 'disputed'/)
  assert.match(followUps, /data\.ck_reimbursement_confirmed === true/)
  assert.match(cronRoute, /resolveCompletedHQNotificationFollowUps\(\)/)
  assert.match(closingActions, /notifyReviewersOfSubmission\([\s\S]*resolveCompletedHQNotificationFollowUps\(\)/)
  assert.match(ckActions, /resolveCompletedHQNotificationFollowUps\(\)/)
})
