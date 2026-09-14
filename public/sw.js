const CACHE = 'lp-v6'
const OFFLINE_URL = '/offline.html'
const PRECACHE_URLS = [OFFLINE_URL, '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { url, method } = e.request
  if (method !== 'GET') return

  // 帳目與登入頁維持 network-only；斷線時只顯示不含敏感資料的備援頁。
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // 靜態資源（帶 hash 的 JS/CSS）→ cache-first，快取後秒開
  if (url.includes('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // 字型、圖示 → cache-first
  if (url.match(/\.(woff2?|png|svg|ico|jpg|jpeg|webp)$/) && !url.includes('supabase')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
      })
    )
  }
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
