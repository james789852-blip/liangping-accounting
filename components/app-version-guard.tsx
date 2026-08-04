'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const VERSION_CHECK_INTERVAL_MS = 2 * 60 * 1000

export function AppVersionGuard({ currentVersion }: { currentVersion: string }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let disposed = false
    let registration: ServiceWorkerRegistration | null = null

    const checkAppVersion = async () => {
      try {
        const response = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'x-app-version-check': '1' },
        })
        if (!response.ok) return
        const data = await response.json() as { version?: string }
        if (
          !disposed
          && currentVersion !== 'development'
          && data.version
          && data.version !== currentVersion
        ) {
          setUpdateAvailable(true)
        }
      } catch {
        // 離線或網路不穩時維持目前頁面，不阻斷店長作帳。
      }
    }

    const checkForUpdates = () => {
      void checkAppVersion()
      void registration?.update().catch(() => undefined)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdates()
    }

    const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller
    const onControllerChange = () => {
      if (hadController) setUpdateAvailable(true)
    }

    if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((registered) => {
          registration = registered
          if (registered.waiting && hadController) setUpdateAvailable(true)
          registered.addEventListener('updatefound', () => {
            const worker = registered.installing
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          })
          checkForUpdates()
        })
        .catch(() => undefined)
    } else {
      void checkAppVersion()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    const interval = window.setInterval(checkForUpdates, VERSION_CHECK_INTERVAL_MS)

    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      }
    }
  }, [currentVersion])

  if (!updateAvailable) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-[100] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-xl"
      style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-950">系統已有新版</p>
        <p className="text-xs text-amber-800">為避免顯示舊帳目，請重新載入後再繼續。</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-white active:bg-amber-600"
      >
        <RefreshCw className="h-4 w-4" />
        重新載入
      </button>
    </div>
  )
}
