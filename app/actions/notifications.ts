'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { canReviewClosings, type PermissionProfile } from '@/lib/user-permissions'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export type HQNotificationFollowUp = {
  status: 'pending' | 'in_progress' | 'resolved'
  claimed_by: string | null
  claimant_name: string | null
  claimed_by_me: boolean
  claimed_at: string | null
  resolved_at: string | null
}

export type AppNotification = {
  id: string
  category: string
  title: string
  body: string
  url: string
  source_key: string
  read_at: string | null
  clicked_at: string | null
  created_at: string
  follow_up: HQNotificationFollowUp | null
}

export async function getMyNotifications(limit = 30) {
  const user = await getVerifiedUser()
  if (!user) return { notifications: [] as AppNotification[], unread: 0 }
  const admin = createAdminClient()
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)))
  const [{ data, error }, { count, error: countError }, { data: profile }] = await Promise.all([
    admin.from('app_notifications')
      .select('id, category, title, body, url, source_key, read_at, clicked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    admin.from('app_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
    admin.from('user_profiles').select('role, can_review_closings, active').eq('user_id', user.id).maybeSingle(),
  ])
  if (error || countError) {
    console.error('[notifications] failed to load:', error || countError)
    return { notifications: [] as AppNotification[], unread: 0 }
  }
  let rows = data ?? []
  if (profile?.active && canReviewClosings(profile as PermissionProfile)) {
    const { data: activeFollowUps } = await admin.from('hq_notification_followups')
      .select('source_key')
      .neq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(100)
    const loadedSourceKeys = new Set(rows.map(notification => String(notification.source_key)))
    const missingSourceKeys = (activeFollowUps ?? [])
      .map(item => String(item.source_key))
      .filter(sourceKey => !loadedSourceKeys.has(sourceKey))
    if (missingSourceKeys.length > 0) {
      const { data: openNotifications } = await admin.from('app_notifications')
        .select('id, category, title, body, url, source_key, read_at, clicked_at, created_at')
        .eq('user_id', user.id)
        .in('source_key', missingSourceKeys)
      const byId = new Map([...rows, ...(openNotifications ?? [])].map(notification => [String(notification.id), notification]))
      rows = [...byId.values()].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    }
  }
  const sourceKeys = rows
    .filter(notification => notification.category === 'hq_escalation')
    .map(notification => String(notification.source_key))
  const { data: followUps, error: followUpError } = sourceKeys.length
    ? await admin.from('hq_notification_followups')
      .select('source_key, status, claimed_by, claimed_at, resolved_at')
      .in('source_key', sourceKeys)
    : { data: [], error: null }
  if (followUpError) console.error('[notifications] failed to load follow-ups:', followUpError)

  const claimantIds = [...new Set((followUps ?? []).map(item => item.claimed_by).filter((id): id is string => !!id))]
  const { data: claimants } = claimantIds.length
    ? await admin.from('user_profiles').select('user_id, name').in('user_id', claimantIds)
    : { data: [] }
  const claimantNames = new Map((claimants ?? []).map(item => [String(item.user_id), String(item.name)]))
  const followUpBySource = new Map((followUps ?? []).map(item => [String(item.source_key), {
    status: item.status as HQNotificationFollowUp['status'],
    claimed_by: item.claimed_by ? String(item.claimed_by) : null,
    claimant_name: item.claimed_by ? claimantNames.get(String(item.claimed_by)) ?? '總公司人員' : null,
    claimed_by_me: item.claimed_by === user.id,
    claimed_at: item.claimed_at,
    resolved_at: item.resolved_at,
  } satisfies HQNotificationFollowUp]))
  const notifications = rows.map(notification => ({
    ...notification,
    follow_up: followUpBySource.get(String(notification.source_key)) ?? null,
  })) as AppNotification[]
  return { notifications, unread: count ?? 0 }
}

async function loadHQFollowUpContext(userId: string, notificationId: string) {
  const admin = createAdminClient()
  const [{ data: profile }, { data: notification }] = await Promise.all([
    admin.from('user_profiles').select('role, can_review_closings, active, name').eq('user_id', userId).maybeSingle(),
    admin.from('app_notifications').select('source_key, category').eq('id', notificationId).eq('user_id', userId).maybeSingle(),
  ])
  if (!profile?.active || !canReviewClosings(profile as PermissionProfile)) return { error: '權限不足' as const }
  if (!notification || notification.category !== 'hq_escalation') return { error: '找不到可接手的異常通知' as const }
  return { admin, profile, sourceKey: String(notification.source_key) }
}

export async function claimHQNotificationFollowUp(notificationId: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  const context = await loadHQFollowUpContext(user.id, notificationId)
  if ('error' in context) return context

  const now = new Date().toISOString()
  // 若原處理人的帳號已刪除，外鍵會把 claimed_by 清空；先恢復成可接手狀態。
  await context.admin.from('hq_notification_followups').update({
    status: 'pending',
    claimed_at: null,
    updated_at: now,
  }).eq('source_key', context.sourceKey).eq('status', 'in_progress').is('claimed_by', null)
  const { data: claimed, error } = await context.admin.from('hq_notification_followups').update({
    status: 'in_progress',
    claimed_by: user.id,
    claimed_at: now,
    updated_at: now,
  }).eq('source_key', context.sourceKey)
    .eq('status', 'pending')
    .is('claimed_by', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: '接手失敗，請稍後再試' }
  if (!claimed) {
    const { data: current } = await context.admin.from('hq_notification_followups')
      .select('status, claimed_by')
      .eq('source_key', context.sourceKey)
      .maybeSingle()
    if (current?.status === 'resolved') return { error: '這項追蹤已經完成' }
    if (current?.claimed_by === user.id) return { success: true as const }
    if (current?.claimed_by) {
      const { data: claimant } = await context.admin.from('user_profiles').select('name').eq('user_id', current.claimed_by).maybeSingle()
      return { error: `${String(claimant?.name || '其他總公司人員')}已經接手處理` }
    }
    return { error: '找不到可接手的異常通知' }
  }

  await context.admin.from('app_notifications').update({
    read_at: now,
    updated_at: now,
  }).eq('id', notificationId).eq('user_id', user.id)
  await logAudit({
    eventType: 'hq_follow_up_claimed',
    userId: user.id,
    description: `${String(context.profile.name || '總公司人員')}接手處理異常通知`,
    metadata: { follow_up_id: claimed.id, source_key: context.sourceKey },
  })
  revalidatePath('/hq/notifications')
  return { success: true as const }
}

export async function releaseHQNotificationFollowUp(notificationId: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  const context = await loadHQFollowUpContext(user.id, notificationId)
  if ('error' in context) return context

  const now = new Date().toISOString()
  const { data: released, error } = await context.admin.from('hq_notification_followups').update({
    status: 'pending',
    claimed_by: null,
    claimed_at: null,
    updated_at: now,
  }).eq('source_key', context.sourceKey)
    .eq('status', 'in_progress')
    .eq('claimed_by', user.id)
    .select('id')
    .maybeSingle()
  if (error) return { error: '取消接手失敗，請稍後再試' }
  if (!released) return { error: '只有目前處理人可以取消接手' }

  await logAudit({
    eventType: 'hq_follow_up_released',
    userId: user.id,
    description: `${String(context.profile.name || '總公司人員')}取消接手異常通知`,
    metadata: { follow_up_id: released.id, source_key: context.sourceKey },
  })
  revalidatePath('/hq/notifications')
  return { success: true as const }
}

export async function markNotificationOpened(notificationId: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { error } = await admin.from('app_notifications').update({
    read_at: now,
    clicked_at: now,
    updated_at: now,
  }).eq('id', notificationId).eq('user_id', user.id)
  return error ? { error: '更新通知狀態失敗' } : { success: true as const }
}

export async function markAllNotificationsRead() {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { error } = await admin.from('app_notifications').update({
    read_at: now,
    updated_at: now,
  }).eq('user_id', user.id).is('read_at', null)
  return error ? { error: '更新通知狀態失敗' } : { success: true as const }
}
