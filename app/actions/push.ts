'use server'

import { getVerifiedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyReviewerOfPendingWork } from '@/lib/push-notifications'
import { after } from 'next/server'

type BrowserPushSubscription = {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

function isValidSubscription(subscription: BrowserPushSubscription) {
  return (
    typeof subscription?.endpoint === 'string'
    && subscription.endpoint.startsWith('https://')
    && subscription.endpoint.length <= 4096
    && typeof subscription.keys?.p256dh === 'string'
    && subscription.keys.p256dh.length > 0
    && subscription.keys.p256dh.length <= 1024
    && typeof subscription.keys?.auth === 'string'
    && subscription.keys.auth.length > 0
    && subscription.keys.auth.length <= 1024
    && (subscription.expirationTime === null || Number.isSafeInteger(subscription.expirationTime))
  )
}

export async function savePushSubscription(subscription: BrowserPushSubscription, userAgent?: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '請先登入後再開啟推播' }
  if (!isValidSubscription(subscription)) return { error: '推播訂閱資料格式錯誤' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('push_subscriptions')
    .select('user_id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  const { error } = await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expiration_time: subscription.expirationTime,
    user_agent: userAgent?.slice(0, 500) || null,
    updated_at: new Date().toISOString(),
    failure_count: 0,
  }, { onConflict: 'endpoint' })

  if (error) {
    console.error('[savePushSubscription] failed:', error)
    return { error: '推播設定儲存失敗，請稍後再試' }
  }

  // 同一支手機切換店長／總公司帳號時，endpoint 會轉綁目前登入者。
  // 若這是新訂閱或切換帳號，總公司審核者登入後補發目前待審摘要，
  // 避免送審事件發生時裝置仍綁在店長帳號而漏掉通知。
  const reassigned = !existing || existing.user_id !== user.id
  if (reassigned) {
    after(async () => {
      await notifyReviewerOfPendingWork(user.id)
    })
  }
  return { success: true as const, reassigned }
}

export async function removePushSubscription(endpoint: string) {
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' }
  if (!endpoint?.startsWith('https://') || endpoint.length > 4096) {
    return { error: '推播訂閱資料格式錯誤' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) return { error: '關閉推播失敗，請稍後再試' }
  return { success: true as const }
}
