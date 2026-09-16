'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { BellRing, Download, PlusSquare, Share, Wifi, WifiOff, X } from 'lucide-react'
import { syncPushSubscriptionToCurrentUser } from '@/lib/push-client'

const INSTALL_DISMISS_KEY = 'lp-pwa-install-dismissed-at'
const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000
const PUSH_DISMISS_KEY = 'lp-push-prompt-dismissed-at'
const PUSH_DISMISS_MS = 14 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isInstallDismissed() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY))
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_DISMISS_MS
  } catch {
    return false
  }
}

function isPushPromptDismissed() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(PUSH_DISMISS_KEY))
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < PUSH_DISMISS_MS
  } catch {
    return false
  }
}

function isRunningStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function InstallPrompt() {
  const pathname = usePathname()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const detectTimer = window.setTimeout(() => {
      if (!isRunningStandalone() && isIOSDevice() && !isInstallDismissed()) {
        setShowIOSGuide(true)
      }
    }, 0)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      if (!isInstallDismissed()) setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setShowIOSGuide(false)
      setHidden(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.clearTimeout(detectTimer)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const safePromptPage = pathname === '/login' || pathname.endsWith('/dashboard')
  if (!safePromptPage || hidden || (!installEvent && !showIOSGuide)) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()))
    } catch {
      // Safari 私密瀏覽可能不允許 localStorage；關閉本次提示即可。
    }
    setHidden(true)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    if (choice.outcome === 'dismissed') dismiss()
  }

  return (
    <aside className="pwa-install-prompt fixed inset-x-3 z-[70] mx-auto max-w-md rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl" aria-label="安裝結帳系統">
      <button type="button" onClick={dismiss} aria-label="關閉安裝提示" className="absolute right-2 top-2 rounded-full p-2 text-zinc-500 active:bg-zinc-100">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <Image src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="font-bold text-zinc-900">把結帳系統加到主畫面</p>
          {showIOSGuide ? (
            <div className="mt-2 space-y-2 text-sm text-zinc-600">
              <p className="flex items-center gap-2"><Share className="h-4 w-4 shrink-0 text-blue-600" />1. 點 Safari 下方的「分享」</p>
              <p className="flex items-center gap-2"><PlusSquare className="h-4 w-4 shrink-0 text-blue-600" />2. 選擇「加入主畫面」</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">安裝後可從手機桌面直接開啟，使用方式就像 App。</p>
          )}
        </div>
      </div>
      {installEvent && (
        <button type="button" onClick={install} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white active:bg-amber-600">
          <Download className="h-4 w-4" />安裝結帳系統
        </button>
      )}
    </aside>
  )
}

function PushPrompt() {
  const pathname = usePathname()
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  useEffect(() => {
    const isAuthenticatedPortal = pathname.startsWith('/manager/') || pathname.startsWith('/hq/')
    if (!publicKey || !isAuthenticatedPortal) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (!isRunningStandalone()) return

    if (Notification.permission === 'granted') {
      let cancelled = false
      let syncing = false
      const sync = async () => {
        if (syncing) return
        syncing = true
        try {
          const result = await syncPushSubscriptionToCurrentUser(publicKey)
          if (!cancelled && result.reassigned) router.refresh()
        } catch (error) {
          console.error('[push] subscription sync failed:', error)
        } finally {
          syncing = false
        }
      }
      void sync()
      const onVisible = () => {
        if (document.visibilityState === 'visible') void sync()
      }
      window.addEventListener('focus', sync)
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        cancelled = true
        window.removeEventListener('focus', sync)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
    const safePromptPage = pathname.endsWith('/dashboard') || pathname === '/hq/accounting'
    if (safePromptPage && Notification.permission === 'default' && !isPushPromptDismissed()) {
      const timer = window.setTimeout(() => setVisible(true), 800)
      return () => window.clearTimeout(timer)
    }
  }, [pathname, publicKey, router])

  const dismiss = () => {
    try {
      window.localStorage.setItem(PUSH_DISMISS_KEY, String(Date.now()))
    } catch {
      // 無法使用 localStorage 時，仍可關閉本次提示。
    }
    setVisible(false)
  }

  const enable = async () => {
    setEnabling(true)
    setMessage(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? '推播已被瀏覽器封鎖，可在手機網站設定中重新允許。' : '尚未允許推播。')
        return
      }
      await syncPushSubscriptionToCurrentUser(publicKey)
      setMessage('推播已開啟，之後會收到帳目送出、審核結果、逾期與點交通知。')
      window.setTimeout(() => setVisible(false), 2200)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '推播開啟失敗，請稍後再試。')
    } finally {
      setEnabling(false)
    }
  }

  if (!visible) return null

  return (
    <aside className="pwa-push-prompt fixed inset-x-3 z-[75] mx-auto max-w-md rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl" aria-label="開啟帳務推播">
      <button type="button" onClick={dismiss} aria-label="關閉推播提示" className="absolute right-2 top-2 rounded-full p-2 text-zinc-500 active:bg-zinc-100">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <BellRing className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-zinc-900">開啟帳務推播</p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">帳目送出、審核結果、逾期提醒或補款點交時，直接在手機收到通知。</p>
        </div>
      </div>
      {message && <p role="status" className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{message}</p>}
      <button type="button" onClick={enable} disabled={enabling} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white active:bg-amber-600 disabled:opacity-60">
        <BellRing className="h-4 w-4" />{enabling ? '正在開啟…' : '開啟推播'}
      </button>
    </aside>
  )
}

function NetworkStatus() {
  const [status, setStatus] = useState<'online' | 'offline' | 'restored'>('online')
  const restoredTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const detectTimer = window.setTimeout(() => {
      if (!navigator.onLine) setStatus('offline')
    }, 0)
    const onOffline = () => {
      if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current)
      setStatus('offline')
    }
    const onOnline = () => {
      setStatus('restored')
      if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current)
      restoredTimerRef.current = window.setTimeout(() => setStatus('online'), 3000)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(detectTimer)
      if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (status === 'online') return null

  return (
    <div role="status" aria-live="polite" className={`fixed inset-x-3 top-3 z-[110] mx-auto flex max-w-xl items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold shadow-xl ${status === 'offline' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
      {status === 'offline' ? <WifiOff className="h-5 w-5 shrink-0" /> : <Wifi className="h-5 w-5 shrink-0" />}
      {status === 'offline' ? '目前沒有網路，帳目與照片暫時無法送出。' : '網路已恢復，可以繼續操作。'}
    </div>
  )
}

export function PWAShell() {
  return (
    <>
      <NetworkStatus />
      <InstallPrompt />
      <PushPrompt />
    </>
  )
}
