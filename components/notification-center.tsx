'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, BellRing, CheckCheck, ChevronRight, X } from 'lucide-react'
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationOpened,
  type AppNotification,
} from '@/app/actions/notifications'

const CATEGORY_LABEL: Record<string, string> = {
  review_submission: '待審核',
  review_result: '審核結果',
  accounting_reminder: '帳目提醒',
  reimbursement_handoff: '補款點交',
  hq_escalation: '總公司追蹤',
  system: '系統通知',
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime()
  if (elapsed < 60000) return '剛剛'
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分鐘前`
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小時前`
  return new Date(value).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })
}

export default function NotificationCenter() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const isPortal = pathname.startsWith('/manager/') || pathname.startsWith('/hq/')

  const refresh = useCallback(async () => {
    if (!isPortal) return
    const result = await getMyNotifications()
    setNotifications(result.notifications)
    setUnread(result.unread)
    setLoaded(true)
  }, [isPortal])

  useEffect(() => {
    if (!isPortal) return
    void refresh()
    const interval = window.setInterval(refresh, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isPortal, pathname, refresh])

  if (!isPortal) return null

  const openNotification = async (notification: AppNotification) => {
    setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item))
    if (!notification.read_at) setUnread(value => Math.max(0, value - 1))
    setOpen(false)
    await markNotificationOpened(notification.id)
    router.push(notification.url.startsWith('/') ? notification.url : '/')
  }

  const markAllRead = async () => {
    const now = new Date().toISOString()
    setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at ?? now })))
    setUnread(0)
    await markAllNotificationsRead()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(value => !value)} aria-label={`通知中心${unread ? `，${unread} 則未讀` : ''}`}
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[65] flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xl lg:bottom-6 lg:right-6"
        style={{ border: unread ? '2px solid #f59e0b' : '1px solid #d4d4d8', color: unread ? '#b45309' : '#52525b' }}>
        {unread ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-6 sm:w-[420px] sm:rounded-2xl"
            onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="font-bold text-zinc-900">通知中心</p>
                <p className="text-xs text-zinc-500">{unread ? `${unread} 則未讀通知` : '目前沒有未讀通知'}</p>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && <button type="button" onClick={markAllRead} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 active:bg-emerald-50"><CheckCheck className="h-4 w-4" />全部已讀</button>}
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-zinc-500 active:bg-zinc-100"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="max-h-[calc(82dvh-68px)] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {!loaded ? (
                <p className="p-8 text-center text-sm text-zinc-400">正在載入通知…</p>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center text-zinc-400"><Bell className="mx-auto mb-2 h-8 w-8" /><p className="text-sm">尚無通知紀錄</p></div>
              ) : notifications.map(notification => (
                <button key={notification.id} type="button" onClick={() => openNotification(notification)}
                  className="flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3 text-left active:bg-zinc-50"
                  style={{ background: notification.read_at ? 'white' : '#fffbeb' }}>
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: notification.read_at ? '#d4d4d8' : '#f59e0b' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-amber-700">{CATEGORY_LABEL[notification.category] ?? '帳務通知'}</span>
                      <span className="text-[10px] text-zinc-400">{relativeTime(notification.created_at)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm font-bold text-zinc-900">{notification.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-zinc-600">{notification.body}</span>
                  </span>
                  <ChevronRight className="mt-5 h-4 w-4 shrink-0 text-zinc-300" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
