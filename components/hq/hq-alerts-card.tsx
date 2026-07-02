'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { fetchHQAlerts, type HQAlerts } from '@/app/actions/hq-alerts'

export default function HQAlertsCard() {
  const [alerts, setAlerts] = useState<HQAlerts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHQAlerts()
      .then(r => {
        if ('error' in r) return
        setAlerts(r.alerts)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl p-4 flex items-center justify-center gap-2 text-sm"
        style={{ background: 'white', border: '1px solid #f4f4f5', color: '#a1a1aa' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        載入提醒…
      </div>
    )
  }
  if (!alerts) return null

  const totalIssues = alerts.storeNotClosed.length + alerts.storeInDraft.length + alerts.storeInDispute.length + alerts.ckNotSubmitted.length

  if (totalIssues === 0) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-2"
        style={{ background: '#d1fae5', border: '1px solid #bbf7d0', color: '#047857' }}>
        <CheckCircle2 className="h-5 w-5" />
        <div>
          <p className="text-sm font-bold">今日全部完成 ✨</p>
          <p className="text-xs">所有店家 + 央廚都已送出結帳</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5" style={{ color: '#c2410c' }} />
        <p className="text-sm font-bold" style={{ color: '#7c2d12' }}>今日提醒（{alerts.today}）</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <AlertBlock
          label="店家未結帳"
          count={alerts.storeNotClosed.length}
          items={alerts.storeNotClosed}
          color="#dc2626"
          hrefBase="/hq/closings"
        />
        <AlertBlock
          label="店家草稿中"
          count={alerts.storeInDraft.length}
          items={alerts.storeInDraft}
          color="#d97706"
          hrefBase="/hq/closings"
        />
        <AlertBlock
          label="店家退回中"
          count={alerts.storeInDispute.length}
          items={alerts.storeInDispute}
          color="#b91c1c"
          hrefBase="/hq/closings"
        />
        <AlertBlock
          label="央廚未送出"
          count={alerts.ckNotSubmitted.length}
          items={alerts.ckNotSubmitted}
          color="#c2410c"
          hrefBase="/hq/ck"
        />
      </div>
    </div>
  )
}

function AlertBlock({ label, count, items, color, hrefBase }: {
  label: string; count: number; items: Array<{ id: string; name: string }>; color: string; hrefBase: string
}) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: 'white', border: '1px solid #f4f4f5' }}>
      <p className="text-[11px]" style={{ color: '#71717a' }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ color }}>{count}</p>
      {items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {items.slice(0, 3).map(s => (
            <li key={s.id}>
              <Link href={hrefBase} className="text-[11px] hover:underline" style={{ color: '#52525b' }}>
                · {s.name}
              </Link>
            </li>
          ))}
          {items.length > 3 && (
            <li className="text-[10px]" style={{ color: '#a1a1aa' }}>...還有 {items.length - 3} 家</li>
          )}
        </ul>
      )}
    </div>
  )
}
