'use client'

import { useEffect } from 'react'
import { AlertTriangle, LogIn, RefreshCw } from 'lucide-react'

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('頁面載入失敗', error)
  }, [error])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">頁面暫時無法載入</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          可能是網路或登入狀態剛更新。請先重新載入；已儲存的帳目草稿不會因此被刪除。
        </p>
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 font-bold text-white active:bg-amber-600"
          >
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            重新載入
          </button>
          <a
            href="/login"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 font-bold text-slate-700"
          >
            <LogIn className="h-5 w-5" aria-hidden="true" />
            重新登入
          </a>
        </div>
      </section>
    </main>
  )
}
