'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'

export type AppNotification = {
  id: string
  category: string
  title: string
  body: string
  url: string
  read_at: string | null
  clicked_at: string | null
  created_at: string
}

export async function getMyNotifications(limit = 30) {
  const user = await getVerifiedUser()
  if (!user) return { notifications: [] as AppNotification[], unread: 0 }
  const admin = createAdminClient()
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)))
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    admin.from('app_notifications')
      .select('id, category, title, body, url, read_at, clicked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    admin.from('app_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
  ])
  if (error || countError) {
    console.error('[notifications] failed to load:', error || countError)
    return { notifications: [] as AppNotification[], unread: 0 }
  }
  return { notifications: (data ?? []) as AppNotification[], unread: count ?? 0 }
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
