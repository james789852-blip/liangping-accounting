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

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const relativeUrl = event.notification.data?.url || '/'
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
      const existingClient = windowClients.find(client => client.url.startsWith(self.location.origin))
      if (existingClient) {
        return existingClient.focus().then(client => client.navigate(destination))
      }
      return self.clients.openWindow(destination)
      }),
    ])
  )
})
