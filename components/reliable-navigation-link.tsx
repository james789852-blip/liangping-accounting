'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from 'react'
import { LoaderCircle } from 'lucide-react'

type ReliableNavigationLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>

export default function ReliableNavigationLink({
  href,
  onClick,
  ...props
}: ReliableNavigationLinkProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isCheckingVersion, setIsCheckingVersion] = useState(false)
  const fallbackTimerRef = useRef<number | null>(null)
  const hrefString = typeof href === 'string' ? href : href.pathname ?? ''
  const mustUseLatestVersion = hrefString === '/manager/closing'
    || hrefString.startsWith('/manager/closing?')

  useEffect(() => {
    setIsCheckingVersion(false)
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }

    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }
    }
  }, [pathname])

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || !mustUseLatestVersion
    ) {
      return
    }

    event.preventDefault()
    if (isCheckingVersion) return
    setIsCheckingVersion(true)

    const versionCheckController = new AbortController()
    const versionCheckTimer = window.setTimeout(
      () => versionCheckController.abort(),
      4_000,
    )

    try {
      const response = await fetch(`/api/version?navigation=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'x-app-version-check': '1' },
        signal: versionCheckController.signal,
      })
      const data = response.ok
        ? await response.json() as { version?: string }
        : null
      const currentVersion = document.documentElement.dataset.appVersion

      if (
        currentVersion
        && currentVersion !== 'development'
        && data?.version
        && data.version !== currentVersion
      ) {
        const destination = new URL(hrefString, window.location.origin)
        destination.searchParams.set('__app_update', Date.now().toString())
        window.location.replace(destination.href)
        return
      }
    } catch {
      // 網路短暫不穩時仍交給 Next.js 導航，避免阻斷今日結帳。
    } finally {
      window.clearTimeout(versionCheckTimer)
    }

    router.push(hrefString)
    fallbackTimerRef.current = window.setTimeout(() => {
      const destination = new URL(hrefString, window.location.origin)
      destination.searchParams.set('__app_update', Date.now().toString())
      window.location.replace(destination.href)
    }, 12_000)
  }

  // Protected pages must not all refresh the same Supabase session in the
  // background. They load on demand when the user actually selects one.
  return (
    <>
      <Link href={href} prefetch={false} onClick={handleClick} {...props} />
      {isCheckingVersion && typeof document !== 'undefined'
        ? createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[200] flex items-center justify-center bg-white/95"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center">
              <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
              <p className="font-bold text-zinc-800">正在開啟今日結帳</p>
              <p className="text-sm text-zinc-500">正在確認最新版本，請稍候…</p>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  )
}
