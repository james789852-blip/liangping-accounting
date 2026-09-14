import 'server-only'

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { canReviewClosings, type PermissionProfile } from '@/lib/user-permissions'
import { getBusinessDate } from '@/lib/business-date'

type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

export type PushCategory =
  | 'review_submission'
  | 'review_result'
  | 'accounting_reminder'
  | 'reimbursement_handoff'
  | 'hq_escalation'
  | 'system'

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
  device_name: string | null
}

type NotificationRow = PushPayload & {
  id: string
  user_id: string
}

type DeliveryJobRow = {
  id: string
  notification_id: string
  subscription_id: string | null
  attempt_count: number
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

function preferenceEnabled(value: unknown, category: PushCategory) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true
  return (value as Record<string, unknown>)[category] !== false
}

function deliveryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500)
  return String(error).slice(0, 500)
}

async function deliverPushJobs(input: { notificationIds?: string[]; limit?: number } = {}) {
  if (!configureVapid()) return { total: 0, delivered: 0, pending: 0, failed: 0 }
  const admin = createAdminClient()
  let query = admin
    .from('push_delivery_jobs')
    .select('id, notification_id, subscription_id, attempt_count')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(input.limit ?? 100)
  if (input.notificationIds?.length) query = query.in('notification_id', input.notificationIds) as typeof query
  const { data: rawJobs, error: jobError } = await query
  if (jobError) {
    console.error('[push] failed to load delivery jobs:', jobError)
    return { total: 0, delivered: 0, pending: 0, failed: 0 }
  }

  const jobs = (rawJobs ?? []) as DeliveryJobRow[]
  if (jobs.length === 0) return { total: 0, delivered: 0, pending: 0, failed: 0 }
  const notificationIds = [...new Set(jobs.map(job => job.notification_id))]
  const subscriptionIds = [...new Set(jobs.map(job => job.subscription_id).filter((id): id is string => !!id))]
  const [{ data: notificationData }, { data: subscriptionData }] = await Promise.all([
    admin.from('app_notifications').select('id, user_id, title, body, url, tag').in('id', notificationIds),
    subscriptionIds.length
      ? admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, failure_count, device_name').in('id', subscriptionIds)
      : Promise.resolve({ data: [] }),
  ])
  const notifications = new Map(((notificationData ?? []) as NotificationRow[]).map(row => [row.id, row]))
  const subscriptions = new Map(((subscriptionData ?? []) as PushSubscriptionRow[]).map(row => [row.id, row]))
  const resultCounts = { delivered: 0, pending: 0, failed: 0 }

  await Promise.all(jobs.map(async job => {
    const notification = notifications.get(job.notification_id)
    const subscription = job.subscription_id ? subscriptions.get(job.subscription_id) : undefined
    const attemptedAt = new Date().toISOString()
    if (!notification || !subscription || subscription.user_id !== notification.user_id) {
      await admin.from('push_delivery_jobs').update({
        status: 'failed', last_attempt_at: attemptedAt, updated_at: attemptedAt,
        last_error: '推播裝置已解除綁定',
      }).eq('id', job.id)
      resultCounts.failed += 1
      return
    }

    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url,
        tag: notification.tag,
        notificationId: notification.id,
      }), { TTL: 60 * 60, urgency: 'normal' })

      await Promise.all([
        admin.from('push_delivery_jobs').update({
          status: 'delivered', attempt_count: job.attempt_count + 1,
          delivered_at: attemptedAt, last_attempt_at: attemptedAt,
          last_error: null, updated_at: attemptedAt,
        }).eq('id', job.id),
        admin.from('push_subscriptions').update({
          last_success_at: attemptedAt, failure_count: 0, updated_at: attemptedAt,
        }).eq('id', subscription.id),
      ])
      resultCounts.delivered += 1
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0
      const attemptCount = job.attempt_count + 1
      const expired = statusCode === 404 || statusCode === 410
      const shouldRetry = !expired && attemptCount < 3
      const retryMinutes = attemptCount === 1 ? 5 : 15
      await admin.from('push_delivery_jobs').update({
        status: shouldRetry ? 'pending' : 'failed',
        attempt_count: attemptCount,
        next_attempt_at: shouldRetry ? new Date(Date.now() + retryMinutes * 60000).toISOString() : attemptedAt,
        last_attempt_at: attemptedAt,
        last_error: `${statusCode ? `${statusCode} ` : ''}${deliveryErrorMessage(error)}`.trim(),
        updated_at: attemptedAt,
      }).eq('id', job.id)
      if (expired) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      else await admin.from('push_subscriptions').update({
        failure_count: subscription.failure_count + 1,
        updated_at: attemptedAt,
      }).eq('id', subscription.id)
      if (shouldRetry) resultCounts.pending += 1
      else resultCounts.failed += 1
      console.error('[push] delivery failed:', statusCode || error)
    }
  }))

  return { total: jobs.length, ...resultCounts }
}

export async function processPendingPushJobs(limit = 100) {
  const admin = createAdminClient()
  await admin.from('app_notifications').delete()
    .not('read_at', 'is', null)
    .lt('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
  return deliverPushJobs({ limit })
}

async function sendToUserIds(
  userIds: string[],
  payload: PushPayload,
  options: { category: PushCategory; storeId?: string; sourceKey?: string; pushEnabled?: boolean },
) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) return { total: 0, delivered: 0 }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const sourceKey = options.sourceKey ?? payload.tag
  const { data: notificationData, error: notificationError } = await admin
    .from('app_notifications')
    .upsert(uniqueUserIds.map(userId => ({
      user_id: userId,
      store_id: options.storeId ?? null,
      category: options.category,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      source_key: sourceKey,
      updated_at: now,
    })), { onConflict: 'user_id,source_key' })
    .select('id, user_id, title, body, url, tag')
  if (notificationError) {
    console.error('[push] failed to save notifications:', notificationError)
    return { total: 0, delivered: 0 }
  }
  const notifications = (notificationData ?? []) as NotificationRow[]

  const { data: profileData } = await admin.from('user_profiles')
    .select('user_id, push_notifications_enabled, push_notification_preferences')
    .in('user_id', uniqueUserIds)
  const pushEligibleUserIds = new Set((profileData ?? [])
    .filter(profile => options.category === 'system' || (
      options.pushEnabled !== false
      && profile.push_notifications_enabled !== false
      && preferenceEnabled(profile.push_notification_preferences, options.category)
    ))
    .map(profile => String(profile.user_id)))

  const { data, error } = pushEligibleUserIds.size > 0 ? await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, failure_count, device_name')
    .in('user_id', [...pushEligibleUserIds]) : { data: [], error: null }

  if (error) {
    console.error('[push] failed to load subscriptions:', error)
    return { total: 0, delivered: 0 }
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[]
  const notificationByUser = new Map(notifications.map(notification => [notification.user_id, notification]))
  const jobs = subscriptions.flatMap(subscription => {
    const notification = notificationByUser.get(subscription.user_id)
    return notification ? [{
      notification_id: notification.id,
      subscription_id: subscription.id,
      device_name: subscription.device_name,
      status: 'pending',
      next_attempt_at: now,
    }] : []
  })
  if (jobs.length > 0) {
    const { error: insertError } = await admin.from('push_delivery_jobs').upsert(jobs, {
      onConflict: 'notification_id,subscription_id',
      ignoreDuplicates: true,
    })
    if (insertError) console.error('[push] failed to create delivery jobs:', insertError)
  }
  return deliverPushJobs({ notificationIds: notifications.map(notification => notification.id), limit: Math.max(100, jobs.length) })
}

async function storeName(storeId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('stores').select('name').eq('id', storeId).maybeSingle()
  return String(data?.name || '店家')
}

async function reviewerUserIds(excludeUserId?: string, _category: PushCategory = 'review_submission') {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, role, can_review_closings, push_notifications_enabled, push_notification_preferences')
    .eq('active', true)
  if (error) {
    console.error('[push] failed to load reviewers:', error)
    return []
  }
  return (data ?? [])
    .filter(profile => canReviewClosings(profile as PermissionProfile))
    .map(profile => String(profile.user_id))
    .filter(userId => userId !== excludeUserId)
}

async function storeUserIds(
  storeId: string,
  excludeUserId?: string,
  _includeDisabled = false,
  _category: PushCategory = 'review_result',
) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id, role, is_hq, push_notifications_enabled, push_notification_preferences')
    .eq('active', true)
    .contains('store_ids', [storeId])
  if (error) {
    console.error('[push] failed to load store users:', error)
    return []
  }
  return (data ?? [])
    .filter(profile => profile.role !== '老闆' && profile.is_hq !== true)
    .map(profile => String(profile.user_id))
    .filter(userId => userId !== excludeUserId)
}

export async function notifyReviewersOfSubmission(input: {
  kind: 'store' | 'ck'
  storeId: string
  businessDate: string
  recordId: string
  senderId: string
  submissionEventId: string
  wasReturned?: boolean
}) {
  const [name, userIds] = await Promise.all([
    storeName(input.storeId),
    reviewerUserIds(input.senderId, 'review_submission'),
  ])
  const isCK = input.kind === 'ck'
  const admin = createAdminClient()
  const [storeResult, ckResult] = await Promise.all([
    admin.from('daily_closings').select('id', { count: 'exact', head: true })
      .eq('status', 'submitted').eq('business_date', input.businessDate),
    admin.from('ck_daily_records').select('id', { count: 'exact', head: true })
      .eq('status', 'submitted').eq('business_date', input.businessDate),
  ])
  const parts = [
    (storeResult.count ?? 0) > 0 ? `${storeResult.count} 筆店面帳目` : '',
    (ckResult.count ?? 0) > 0 ? `${ckResult.count} 筆央廚帳目` : '',
  ].filter(Boolean)
  await sendToUserIds(userIds, {
    title: input.wasReturned ? '退回帳目已重新送出' : '有帳目等待審核',
    body: `${name} ${input.businessDate} ${isCK ? '央廚' : '店面'}帳目${input.wasReturned ? '已修正並重新送出' : '已送出'}，等待審核。${parts.length ? `該營業日目前共有${parts.join('、')}待審。` : ''}`,
    url: isCK
      ? `/hq/accounting?tab=ck&ckStoreId=${encodeURIComponent(input.storeId)}&date=${input.businessDate}`
      : `/hq/accounting?tab=store&storeId=${encodeURIComponent(input.storeId)}&date=${input.businessDate}`,
    tag: 'pending-review-summary',
  }, {
    category: 'review_submission',
    storeId: input.storeId,
    // 同一筆帳目退回後會再次送出；每一次狀態轉入 submitted 都是獨立事件。
    // submissionEventId 讓重送產生新的通知與投遞工作，同一次操作仍由資料庫唯一鍵防重。
    sourceKey: `${input.kind}-submission-${input.recordId}-${input.submissionEventId}`,
  })
}

export async function notifyReviewerOfPendingWork(userId: string) {
  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role, can_review_closings, active, push_notifications_enabled, push_notification_preferences')
    .eq('user_id', userId)
    .maybeSingle()
  if (
    profileError
    || !profile?.active
    || profile.push_notifications_enabled === false
    || !preferenceEnabled(profile.push_notification_preferences, 'review_submission')
    || !canReviewClosings(profile as PermissionProfile)
  ) return

  const businessDate = getBusinessDate()
  const [storeResult, ckResult] = await Promise.all([
    admin.from('daily_closings').select('id', { count: 'exact', head: true })
      .eq('status', 'submitted').eq('business_date', businessDate),
    admin.from('ck_daily_records').select('id', { count: 'exact', head: true })
      .eq('status', 'submitted').eq('business_date', businessDate),
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
    title: '今日有帳目等待審核',
    body: `${businessDate} 目前共有${parts.join('、')}待審。`,
    url: '/hq/accounting',
    tag: 'pending-review-summary',
  }, {
    category: 'review_submission',
    sourceKey: `pending-review-login-${userId}-${Date.now()}`,
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
    admin.from('stores').select('name, push_notifications_enabled, push_notification_preferences').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId, input.reviewerId, false, 'review_result'),
  ])
  const pushEnabled = store?.push_notifications_enabled !== false && preferenceEnabled(store?.push_notification_preferences, 'review_result')
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
  }, {
    category: 'review_result',
    storeId: input.storeId,
    sourceKey: `${input.kind}-review-${input.decision}-${input.recordId}`,
    pushEnabled,
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
    admin.from('stores').select('name, push_notifications_enabled, push_notification_preferences').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId, undefined, false, 'accounting_reminder'),
  ])
  const pushEnabled = store?.push_notifications_enabled !== false && preferenceEnabled(store?.push_notification_preferences, 'accounting_reminder')

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
  }, {
    category: 'accounting_reminder',
    storeId: input.storeId,
    pushEnabled,
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
    admin.from('stores').select('name, push_notifications_enabled, push_notification_preferences').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId, undefined, false, 'reimbursement_handoff'),
  ])
  const pushEnabled = store?.push_notifications_enabled !== false && preferenceEnabled(store?.push_notification_preferences, 'reimbursement_handoff')

  const name = String(store?.name || '央廚')
  const isReminder = input.stage === '17:00'
  return sendToUserIds(userIds, {
    title: isReminder ? '補款尚未點交' : '總公司補款等待點交',
    body: isReminder
      ? `${name} ${input.businessDate} 的補款尚未完成點交，請盡快確認。`
      : `${name} ${input.businessDate} 的總公司補款信封照片已送達，請確認收到後完成點交。`,
    url: `/manager/ck?date=${input.businessDate}`,
    tag: `ck-reimbursement-${input.stage}-${input.recordId}`,
  }, {
    category: 'reimbursement_handoff',
    storeId: input.storeId,
    pushEnabled,
  })
}

export async function notifyStoreUsersOfReturnedReminder(input: {
  kind: 'store' | 'ck'
  storeId: string
  businessDate: string
  recordId: string
  disputedAt: string
}) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name, push_notifications_enabled, push_notification_preferences').eq('id', input.storeId).maybeSingle(),
    storeUserIds(input.storeId, undefined, false, 'accounting_reminder'),
  ])
  const pushEnabled = store?.push_notifications_enabled !== false && preferenceEnabled(store?.push_notification_preferences, 'accounting_reminder')
  const name = String(store?.name || (input.kind === 'ck' ? '央廚' : '店家'))
  return sendToUserIds(userIds, {
    title: '退回帳目仍待修改',
    body: `${name} ${input.businessDate} 帳目退回已超過 60 分鐘，請修改後重新送出。`,
    url: input.kind === 'ck'
      ? `/manager/ck?date=${input.businessDate}`
      : `/manager/history/${encodeURIComponent(input.recordId)}`,
    tag: `${input.kind}-returned-reminder-${input.recordId}`,
  }, {
    category: 'accounting_reminder',
    storeId: input.storeId,
    sourceKey: `${input.kind}-returned-reminder-${input.recordId}-${input.disputedAt}`,
    pushEnabled,
  })
}

export async function notifyReviewersOfEscalation(input: {
  title: string
  body: string
  url: string
  sourceKey: string
  storeId?: string
}) {
  const userIds = await reviewerUserIds(undefined, 'hq_escalation')
  return sendToUserIds(userIds, {
    title: input.title,
    body: input.body,
    url: input.url,
    tag: 'hq-accounting-escalation',
  }, {
    category: 'hq_escalation',
    storeId: input.storeId,
    sourceKey: input.sourceKey,
  })
}

export async function sendTestPushToStore(storeId: string) {
  const admin = createAdminClient()
  const [{ data: store }, userIds] = await Promise.all([
    admin.from('stores').select('name').eq('id', storeId).maybeSingle(),
    storeUserIds(storeId, undefined, true, 'system'),
  ])
  if (!store) return { error: '找不到店家' as const }
  return sendToUserIds(userIds, {
    title: '結帳系統測試通知',
    body: `${String(store.name)} 推播設定正常。`,
    url: '/manager/dashboard',
    tag: `store-push-test-${storeId}`,
  }, {
    category: 'system',
    storeId,
    sourceKey: `store-push-test-${storeId}-${Date.now()}`,
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
  }, {
    category: 'system',
    sourceKey: `user-push-test-${userId}-${Date.now()}`,
  })
}
