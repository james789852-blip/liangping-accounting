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
  if (uniqueUserIds.length === 0 || !configureVapid()) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .in('user_id', uniqueUserIds)

  if (error) {
    console.error('[push] failed to load subscriptions:', error)
    return
  }

  const subscriptions = (data ?? []) as PushSubscriptionRow[]
  await Promise.all(subscriptions.map(async subscription => {
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
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id)
        return
      }
      console.error('[push] delivery failed:', statusCode || error)
      await admin.from('push_subscriptions').update({
        failure_count: subscription.failure_count + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id)
    }
  }))
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
    .select('user_id, role, can_review_closings')
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

async function storeUserIds(storeId: string, excludeUserId?: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('user_id')
    .eq('active', true)
    .contains('store_ids', [storeId])
  if (error) {
    console.error('[push] failed to load store users:', error)
    return []
  }
  return (data ?? []).map(profile => String(profile.user_id)).filter(userId => userId !== excludeUserId)
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
    .select('role, can_review_closings, active')
    .eq('user_id', userId)
    .maybeSingle()
  if (profileError || !profile?.active || !canReviewClosings(profile as PermissionProfile)) return

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
  const [name, userIds] = await Promise.all([
    storeName(input.storeId),
    storeUserIds(input.storeId, input.reviewerId),
  ])
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
