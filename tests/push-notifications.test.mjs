import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const pushAction = fs.readFileSync(new URL('../app/actions/push.ts', import.meta.url), 'utf8')
const pushModule = fs.readFileSync(new URL('../lib/push-notifications.ts', import.meta.url), 'utf8')
const pwaShell = fs.readFileSync(new URL('../components/pwa-shell.tsx', import.meta.url), 'utf8')
const serviceWorker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const closingsAction = fs.readFileSync(new URL('../app/actions/closings.ts', import.meta.url), 'utf8')
const ckAction = fs.readFileSync(new URL('../app/actions/ck.ts', import.meta.url), 'utf8')
const managerNav = fs.readFileSync(new URL('../components/manager/nav.tsx', import.meta.url), 'utf8')
const hqNav = fs.readFileSync(new URL('../components/hq/nav.tsx', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/069_push_subscriptions.sql', import.meta.url), 'utf8')

test('推播訂閱只能由登入者管理自己的裝置', () => {
  assert.match(pushAction, /const user = await getVerifiedUser\(\)/)
  assert.match(pushAction, /\.eq\('user_id', user\.id\)/)
  assert.match(migration, /alter table push_subscriptions enable row level security/)
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/)
  assert.match(migration, /revoke all on table push_subscriptions from anon/)
})

test('手機須由使用者點擊後才要求推播權限並建立訂閱', () => {
  assert.match(pwaShell, /onClick=\{enable\}/)
  assert.match(pwaShell, /Notification\.requestPermission\(\)/)
  assert.match(pwaShell, /pushManager\.subscribe\(/)
  assert.match(pwaShell, /if \(!isRunningStandalone\(\)\) return/)
  assert.match(pwaShell, /pathname\.startsWith\('\/manager\/'\) \|\| pathname\.startsWith\('\/hq\/'\)/)
})

test('Service Worker 顯示通知並可前往對應帳目', () => {
  assert.match(serviceWorker, /addEventListener\('push'/)
  assert.match(serviceWorker, /showNotification\(title/)
  assert.match(serviceWorker, /addEventListener\('notificationclick'/)
  assert.match(serviceWorker, /client\.navigate\(destination\)/)
})

test('店面與央廚送審及審核結果都會在回應後發送推播', () => {
  assert.match(closingsAction, /notifyReviewersOfSubmission\(\{\s*kind: 'store'/)
  assert.match(closingsAction, /notifyStoreUsersOfReview\(\{\s*kind: 'store'/)
  assert.match(ckAction, /notifyReviewersOfSubmission\(\{\s*kind: 'ck'/)
  assert.match(ckAction, /notifyStoreUsersOfReview\(\{\s*kind: 'ck'/)
  assert.match(pushModule, /canReviewClosings\(profile as PermissionProfile\)/)
  assert.doesNotMatch(pushModule, /review_note|dispute_note/)
})

test('同一裝置切換到總公司帳號時會重新綁定並補發待審摘要', () => {
  assert.match(pushAction, /existing\.user_id !== user\.id/)
  assert.match(pushAction, /notifyReviewerOfPendingWork\(user\.id\)/)
  assert.match(pushModule, /export async function notifyReviewerOfPendingWork/)
  assert.match(pushModule, /有帳目等待審核/)
  assert.match(pushModule, /\.eq\('status', 'submitted'\)/)
  assert.match(managerNav, /await detachPushSubscriptionFromCurrentUser\(\)/)
  assert.match(hqNav, /await detachPushSubscriptionFromCurrentUser\(\)/)
})

test('失效的裝置訂閱會自動移除', () => {
  assert.match(pushModule, /statusCode === 404 \|\| statusCode === 410/)
  assert.match(pushModule, /from\('push_subscriptions'\)\.delete\(\)\.eq\('id', subscription\.id\)/)
})
