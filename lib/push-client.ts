'use client'

import { removePushSubscription } from '@/app/actions/push'

// 登出時只解除伺服器上的帳號綁定，保留瀏覽器 subscription。
// 下一個登入者可沿用同一裝置重新綁定，不必再次跳出系統權限視窗。
export async function detachPushSubscriptionFromCurrentUser() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription?.endpoint) await removePushSubscription(subscription.endpoint)
  } catch (error) {
    // 登出不應因推播服務暫時失敗而被阻擋。
    console.error('[push] failed to detach subscription during logout:', error)
  }
}
