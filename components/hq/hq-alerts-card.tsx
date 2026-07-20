'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { fetchHQAlerts, type HQAlerts, type OverdueAlert } from '@/app/actions/hq-alerts'

const overdueStatusStyle: Record<OverdueAlert['status'], { label: string; bg: string; color: string }> = {
  not_submitted: { label: '未送出', bg: '#fff1f2', color: '#be123c' },
  draft: { label: '草稿未送出', bg: '#fff7ed', color: '#c2410c' },
  review: { label: '待審核', bg: '#eff6ff', color: '#1d4ed8' },
  dispute: { label: '退回待修改', bg: '#fff1f2', color: '#be123c' },
  handoff: { label: '待點交', bg: '#fffbeb', color: '#92400e' },
}

export default function HQAlertsCard() {
  const [alerts, setAlerts] = useState<HQAlerts | null>(null)

  useEffect(() => {
    fetchHQAlerts()
      .then(r => {
        if ('error' in r) return
        setAlerts(r.alerts)
      })
  }, [])

  if (!alerts || alerts.overdue.length === 0) return null

  return <OverdueSection items={alerts.overdue} />
}

function OverdueSection({ items }: { items: OverdueAlert[] }) {
  return (
    <div className="md:col-span-2 rounded-xl bg-white p-3" style={{ border: '1px solid #fecdd3' }}>
      <div className="flex items-start justify-between gap-3 px-2 pb-2">
        <div className="flex items-start gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: '#fff1f2', color: '#be123c' }}>
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#881337' }}>逾期帳目提醒</p>
            <p className="text-xs" style={{ color: '#9f1239' }}>前幾天尚未送出、審核或點交的帳目</p>
          </div>
        </div>
        <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#ffe4e6', color: '#be123c' }}>
          {items.length} 件
        </span>
      </div>
      <div className="max-h-[430px] space-y-2 overflow-y-auto px-1">
        {items.map(item => {
          const meta = overdueStatusStyle[item.status]
          const href = item.entity === 'ck'
            ? `/hq/accounting?tab=ck&ckStoreId=${encodeURIComponent(item.storeId)}&date=${encodeURIComponent(item.date)}`
            : `/hq/accounting?tab=store&storeId=${encodeURIComponent(item.storeId)}&date=${encodeURIComponent(item.date)}`
          return (
            <Link key={item.id} href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-opacity hover:opacity-75"
              style={{ background: '#fffafa', border: '1px solid #fce7f3' }}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: '#18181b' }}>
                  {item.entity === 'ck' ? '央廚' : '店家'} · {item.name}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: '#71717a' }}>{item.date} · 逾期 {item.ageDays} 天</p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                {meta.label}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" style={{ color: '#a1a1aa' }} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
