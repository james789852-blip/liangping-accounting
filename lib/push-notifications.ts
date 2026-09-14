import 'server-only'

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { canReviewClosings, type PermissionProfile } from '@/lib/user-permissions'

type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://liangping-accounting.vercel.app',
    publicKey,
    privateKey,
  )
  vapidConfigured = true
  return true
}

async function sendToUserIds(userIds: string[], payload: PushPayload) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0 || !configureVapid()) return { total: 0, delivered: 0 }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .in('user_id', uniqueUserIds)

  if (error) {
    console.error('[push] failed to load subscriptions:', error)
    return { total: 0, delivered: 0 }
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[]
  const results = await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal' })

      await admin.from('push_subscriptions').update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
      return true
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id)
        return false
      }
      console.error('[push] delivery failed:', statusCode || error)
      await admin.from('push_subscriptions').update({
        failure_count: subscription.failure_count + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
      return false
    }
  }))
  return { total: subscriptions.length, delivered: results.filter(Boolean).length }
}

async function storeName(storeId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('stores').select('name').eq('id', storeId).maybeSingle()
  return String(data?.name || '店家')
}

async function reviewerUserIds(excludeUserId?: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, role, can_review_closings, push_notifications_enabled')
    .eq('active', true)
  if (error) {
    console.error('[push] failed to load reviewers:', error)
    return []
  }
  return (data ?? [])
    .filter(profile => profile.push_notifications_enabled !== false && canReviewClosings(profile as PermissionProfile))
    .map(profile => String(profile.user_id))
    .filter(userId => userId !== excludeUserId)
}

async function storeUserIds(storeId: string, excludeUserId?: string, includeDisabled = false) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, push_notifications_enabled')
    .eq('active', true)
    .contains('store_ids', [storeId])
  if (error) {
    console.error('[push] failed to load store users:', error)
    return []
  }
  return (data ?? [])
    .filter(profile => includeDisabled || profile.push_notifications_enabled !== false)
    .map(profile => String(profile.user_id))
    .filter(userId => userId !== excludeUserId)
}

export async function notifyReviewersOfSubmission(input: {
  kind: 'store' | 'ck'
  storeId: string
  businessDate: string
  recordId: string
  senderId: string
}) {
  const [name, userIds] = await Promise.all([
    storeName(input.storeId),
    reviewerUserIds(input.senderId),
  ])
  const isCK = input.kind === 'ck'
  await sendToUserIds(userIds, {
    title: isCK ? '央廚帳目等待審核' : '店面帳目等待審核',
    body: `${name} ${input.businessDate} 帳目已送出，請進行審核。`,
    url: isCK
      ? `/hq/accounting?tab=ck&ckStoreId=${encodeURIComponent(input.storeId)}&date=${input.businessDate}`
      : `/hq/accounting?tab=store&storeId=${encodeURIComponent(input.storeId)}&date=${input.businessDate}`,
    tag: `${input.kind}-submission-${input.recordId}`,
  })
}

export async function notifyReviewerOfPendingWork(userId: string) {
  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role, can_review_closings, active, push_notifications_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (
    profileError
    || !profile?.active
    || profile.push_notifications_enabled === false
    || !canReviewClosings(profile as PermissionProfile)
  ) return

  const [storeResult, ckResult] = await Promise.all([
    admin.from('daily_closings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    admin.from('ck_daily_records').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
  ])
  if (storeResult.error || ckResult.error) {
    console.error('[push] failed to count pending reviews:', storeResult.error || ckResult.error)
    return
  }

  const storeCount = storeResult.count ?? 0
  const ckCount = ckResult.count ?? 0
  if (storeCount + ckCount === 0) return
  const parts = [
    storeCount > 0 ? `${storeCount} 筆店面帳目` : '',
    ckCount > 0 ? `${ckCount} 筆央廚帳目` : '',
  ].filter(Boolean)

  await sendToUserIds([userId], {
    title: '有帳目等待審核',
    body: `${parts.join('、')}等待審核。`,
    url: '/hq/accounting',
    tag: 'pending-review-summary',
  })
}

export async function notifyStoreUsersOfReview(input: {
  kind: 'store' | 'ck'
  storeId: string
  businessDate: string
  recordId: string
  decision: 'verified' | 'disputed'
  reviewerId: string
}) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name, push_notifications_enabled').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId, input.reviewerId),
  ])
  if (store?.push_notifications_enabled === false) return
  const name = String(store?.name || '店家')
  const verified = input.decision === 'verified'
  const isCK = input.kind === 'ck'
  await sendToUserIds(userIds, {
    title: verified ? '帳目審核通過' : '帳目已退回修改',
    body: `${name} ${input.businessDate} 帳目${verified ? '已審核通過。' : '已被退回，請開啟系統查看原因。'}`,
    url: isCK
      ? `/manager/ck?date=${input.businessDate}`
      : `/manager/history/${encodeURIComponent(input.recordId)}`,
    tag: `${input.kind}-review-${input.recordId}`,
  })
}

export async function notifyStoreUsersOfAccountingReminder(input: {
  kind: 'store' | 'ck'
  storeId: string
  businessDate: string
  stage: '23:00' | '23:30'
  status?: string | null
}) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name, push_notifications_enabled').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId),
  ])
  if (store?.push_notifications_enabled === false) return { total: 0, delivered: 0 }

  const name = String(store?.name || (input.kind === 'ck' ? '央廚' : '店家'))
  const isFinal = input.stage === '23:30'
  const wasReturned = input.status === 'disputed'
  return sendToUserIds(userIds, {
    title: isFinal ? '第二次提醒：帳目尚未送出' : '今晚帳目尚未送出',
    body: `${name} ${input.businessDate} 帳目${wasReturned ? '退回後仍未重新送出' : '尚未送出'}，請${isFinal ? '立即' : '盡快'}完成並送出審核。`,
    url: input.kind === 'ck'
      ? `/manager/ck?date=${input.businessDate}`
      : `/manager/closing?date=${input.businessDate}`,
    tag: `${input.kind}-accounting-reminder-${input.stage}-${input.storeId}-${input.businessDate}`,
  })
}

export async function notifyCKUsersOfReimbursementHandoff(input: {
  storeId: string
  businessDate: string
  recordId: string
  stage: 'received' | '17:00'
}) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name, push_notifications_enabled').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId),
  ])
  if (store?.push_notifications_enabled === false) return { total: 0, delivered: 0 }

  const name = String(store?.name || '央廚')
  const isReminder = input.stage === '17:00'
  return sendToUserIds(userIds, {
    title: isReminder ? '補款尚未點交' : '總公司補款等待點交',
    body: isReminder
      ? `${name} ${input.businessDate} 的補款尚未完成點交，請盡快確認。`
      : `${name} ${input.businessDate} 的總公司補款信封照片已送達，請確認收到後完成點交。`,
    url: `/manager/ck?date=${input.businessDate}`,
    tag: `ck-reimbursement-${input.stage}-${input.recordId}`,
  })
}

export async function sendTestPushToStore(storeId: string) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name').eq('id', storeId).maybeSingle(),
    storeUserIds(storeId, undefined, true),
  ])
  if (!store) return { error: '找不到店家' as const }
  return sendToUserIds(userIds, {
    title: '結帳系統測試通知',
    body: `${String(store.name)} 推播設定正常。`,
    url: '/manager/dashboard',
    tag: `store-push-test-${storeId}`,
  })
}

export async function sendTestPushToUser(userId: string) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('name')
    .eq('user_id', userId)
    .maybeSingle()
  if (!profile) return { error: '找不到帳號' as const }
  return sendToUserIds([userId], {
    title: '結帳系統測試通知',
    body: `${String(profile.name)}，你的推播設定正常。`,
    url: '/',
    tag: `user-push-test-${userId}`,
  })
}
