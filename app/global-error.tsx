'use client'

import { useEffect, useState } from 'react'

const RETRY_LIMIT = 2
const RETRY_WINDOW_MS = 15_000

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const [retryExhausted, setRetryExhausted] = useState(false)

  useEffect(() => {
    console.error('全域頁面載入失敗', error)

    const retryKey = `global-error-retry:${window.location.pathname}`
    let retryState = { count: 0, updatedAt: 0 }
    try {
      retryState = JSON.parse(sessionStorage.getItem(retryKey) ?? '') as typeof retryState
    } catch {
      // 沒有可沿用的重試紀錄時從零開始。
    }

    const now = Date.now()
    const count = now - retryState.updatedAt > RETRY_WINDOW_MS
      ? 0
      : retryState.count

    if (count >= RETRY_LIMIT) {
      setRetryExhausted(true)
      return
    }

    sessionStorage.setItem(retryKey, JSON.stringify({
      count: count + 1,
      updatedAt: now,
    }))
    const retryTimer = window.setTimeout(() => unstable_retry(), 50)
    return () => window.clearTimeout(retryTimer)
  }, [error, unstable_retry])

  return (
    <html lang="zh-Hant">
      <head>
        <title>結帳系統</title>
      </head>
      <body style={{ margin: 0, background: '#f8fafc' }}>
        <main style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          boxSizing: 'border-box',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#27272a',
        }}>
          <section style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{
              width: 44,
              height: 44,
              margin: '0 auto 16px',
              border: '4px solid #fed7aa',
              borderTopColor: '#f59e0b',
              borderRadius: '50%',
              animation: 'lp-spin 0.8s linear infinite',
            }} />
            <style>{'@keyframes lp-spin { to { transform: rotate(360deg); } }'}</style>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {retryExhausted ? '正在恢復頁面' : '正在載入結帳資料'}
            </h1>
            <p style={{ margin: '8px 0 0', color: '#71717a', fontSize: 14 }}>
              {retryExhausted ? '請重新整理後繼續，已儲存的草稿不會消失。' : '請稍候，系統會自動完成。'}
            </p>
            {retryExhausted && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 20,
                  minHeight: 44,
                  padding: '0 20px',
                  border: 0,
                  borderRadius: 12,
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                重新整理
              </button>
            )}
          </section>
        </main>
      </body>
    </html>
  )
}
