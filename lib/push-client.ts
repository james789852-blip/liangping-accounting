'use client'

import { removePushSubscription, savePushSubscription } from '@/app/actions/push'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(character => character.charCodeAt(0)))
}

function serializeSubscription(subscription: PushSubscription) {
  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error('瀏覽器沒有回傳完整的推播訂閱資料')
  }
  return {
    endpoint: serialized.endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
  }
}

export async function syncPushSubscriptionToCurrentUser(publicKey: string) {
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { synced: false as const, reassigned: false }
  }
  if (Notification.permission !== 'granted') {
    return { synced: false as const, reassigned: false }
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  const existingSubscription = await registration.pushManager.getSubscription()
  let subscription = existingSubscription
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  let result = await savePushSubscription(
    serializeSubscription(subscription),
    navigator.userAgent,
    { expectExisting: Boolean(existingSubscription) },
  )
  if ('error' in result) throw new Error(result.error)

  // 伺服器在收到 404/410 後會刪除失效端點。若瀏覽器仍握有該端點，
  // 主動解除並重新訂閱，避免下次同步又把同一個壞端點存回資料庫。
  if (result.refreshRequired) {
    await subscription.unsubscribe()
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    result = await savePushSubscription(
      serializeSubscription(subscription),
      navigator.userAgent,
      { expectExisting: false },
    )
    if ('error' in result) throw new Error(result.error)
  }

  return { synced: true as const, reassigned: result.reassigned }
}

// 登出時只解除伺服器上的帳號綁定，保留瀏覽器 subscription。
// 下一個登入者可沿用同一裝置重新綁定，不必再次跳出系統權限視窗。
export async function detachPushSubscriptionFromCurrentUser() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription?.endpoint) {
      const result = await removePushSubscription(subscription.endpoint)
      if ('error' in result) throw new Error(result.error)
    }
  } catch (error) {
    // 登出不應因推播服務暫時失敗而被阻擋。
    console.error('[push] failed to detach subscription during logout:', error)
  }
}
