self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  // 舊版曾快取頁面資源；升級後清除全部 lp 快取。新版 Service Worker
  // 不再攔截任何頁面或靜態資源請求，只保留推播能力。
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith('lp-')).map(key => caches.delete(key))
      )),
      self.clients.claim(),
    ])
  )
})

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data?.text() }
  }

  const title = typeof data.title === 'string' ? data.title : '結帳系統通知'
  const body = typeof data.body === 'string' ? data.body : '有新的帳務進度，請開啟系統查看。'
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  const tag = typeof data.tag === 'string' ? data.tag : 'liangping-accounting'

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: true,
    data: { url, notificationId: typeof data.notificationId === 'string' ? data.notificationId : null },
  }))
})

const NOTIFICATION_NAVIGATION_MESSAGE = 'lp-notification-navigation'

function clientPortal(clientUrl) {
  try {
    const pathname = new URL(clientUrl).pathname
    if (pathname.startsWith('/hq/')) return 'hq'
    if (pathname.startsWith('/manager/')) return 'manager'
  } catch {
    // Ignore malformed client URLs and use the normal fallback order.
  }
  return 'other'
}

function requestClientNavigation(client, relativeUrl) {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    let settled = false
    const finish = handled => {
      if (settled) return
      settled = true
      resolve(handled)
    }
    const timer = setTimeout(() => finish(false), 800)
    channel.port1.onmessage = message => {
      clearTimeout(timer)
      finish(message.data?.handled === true)
    }
    try {
      client.postMessage({ type: NOTIFICATION_NAVIGATION_MESSAGE, url: relativeUrl }, [channel.port2])
    } catch {
      clearTimeout(timer)
      finish(false)
    }
  })
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const rawUrl = event.notification.data?.url
  const relativeUrl = typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/'
  const destination = new URL(relativeUrl, self.location.origin).href
  const notificationId = event.notification.data?.notificationId

  event.waitUntil(
    Promise.all([
      notificationId
        ? fetch('/api/notifications/click', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId }),
          }).catch(() => null)
        : Promise.resolve(null),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        const destinationClient = windowClients.find(client => client.url === destination)
        if (destinationClient) return destinationClient.focus()

        const sameOriginClients = windowClients.filter(client => client.url.startsWith(self.location.origin))
        const destinationPortal = clientPortal(destination)
        const existingClient = sameOriginClients.find(client => client.focused)
          || sameOriginClients.find(client => client.visibilityState === 'visible' && clientPortal(client.url) === destinationPortal)
          || sameOriginClients.find(client => clientPortal(client.url) === destinationPortal)
          || sameOriginClients.find(client => client.visibilityState === 'visible')
          || sameOriginClients[0]
        if (!existingClient) return self.clients.openWindow(destination)

        // iOS PWA 有時只會喚醒既有視窗，卻忽略 WindowClient.navigate 的查詢參數。
        // 先請目前可見的系統頁用 location.assign 完整導向；舊版頁面沒有接收器時，
        // 再退回標準 navigate/openWindow，確保店家、央廚與日期參數不會遺失。
        return requestClientNavigation(existingClient, relativeUrl).then(handled => {
          if (handled) return existingClient.focus()
          return existingClient.navigate(destination)
            .then(navigatedClient => navigatedClient ? navigatedClient.focus() : self.clients.openWindow(destination))
            .catch(() => self.clients.openWindow(destination))
        })
      }),
    ])
  )
})
