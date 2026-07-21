'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarClock, ChefHat, Store as StoreIcon } from 'lucide-react'
import { fetchHQAlerts, type HQAlerts, type OverdueAlert } from '@/app/actions/hq-alerts'

const overdueStatusStyle: Record<OverdueAlert['status'], { label: string; bg: string; color: string }> = {
  not_submitted: { label: '未送出', bg: '#fff1f2', color: '#be123c' },
  draft: { label: '草稿未送出', bg: '#fff7ed', color: '#c2410c' },
  review: { label: '待審核', bg: '#eff6ff', color: '#1d4ed8' },
  dispute: { label: '退回待修改', bg: '#fff1f2', color: '#be123c' },
  handoff: { label: '待點交', bg: '#fffbeb', color: '#92400e' },
}

const overdueStatusOrder: OverdueAlert['status'][] = ['not_submitted', 'review', 'handoff']

const overdueStatusLabel: Record<OverdueAlert['status'], string> = {
  not_submitted: '未送出',
  draft: '草稿未送出',
  review: '未審核',
  dispute: '退回待修改',
  handoff: '未點交',
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
  const visibleItems = items.filter(item => overdueStatusOrder.includes(item.status))
  const groups = overdueStatusOrder.map(status => ({
    status,
    items: visibleItems.filter(item => item.status === status),
  }))
  if (visibleItems.length === 0) return null

  return (
    <section className="rounded-2xl bg-white p-3 sm:p-4" style={{ border: '1px solid #fecdd3' }}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-start gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: '#fff1f2', color: '#be123c' }}>
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: '#881337' }}>逾期帳目提醒</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: '#9f1239' }}>未送出、未審核、未點交</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#ffe4e6', color: '#be123c' }}>
          {visibleItems.length} 件
        </span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {groups.map(group => {
          const meta = overdueStatusStyle[group.status]
          return (
            <div key={group.status} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2" style={{ background: meta.bg }}>
              <span className="truncate text-[11px] font-bold" style={{ color: meta.color }}>{overdueStatusLabel[group.status]}</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: meta.color }}>{group.items.length}</span>
            </div>
          )
        })}
      </div>
      <div className="max-h-[320px] overflow-y-auto rounded-xl" style={{ border: '1px solid #f4e4e7' }}>
        <div className="divide-y" style={{ borderColor: '#f4e4e7' }}>
          {visibleItems.map(item => {
            const meta = overdueStatusStyle[item.status]
            const href = item.entity === 'ck'
              ? `/hq/accounting?tab=ck&ckStoreId=${encodeURIComponent(item.storeId)}&date=${encodeURIComponent(item.date)}`
              : `/hq/accounting?tab=store&storeId=${encodeURIComponent(item.storeId)}&date=${encodeURIComponent(item.date)}`
            const EntityIcon = item.entity === 'ck' ? ChefHat : StoreIcon
            return (
              <Link key={item.id} href={href}
                className="group flex items-center gap-2.5 bg-white px-3 py-2.5 transition-colors hover:bg-rose-50/50">
                <span className="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-bold"
                  style={item.entity === 'ck'
                    ? { background: '#f4f4f5', color: '#52525b' }
                    : { background: '#fff7ed', color: '#c2410c' }}>
                  <EntityIcon className="h-3 w-3" />
                  {item.entity === 'ck' ? '央廚' : '店家'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: '#18181b' }}>{item.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums" style={{ color: '#71717a' }}>
                    <span>{item.date}</span>
                    <span aria-hidden="true" style={{ color: '#d4d4d8' }}>•</span>
                    <span className="font-semibold" style={{ color: item.ageDays >= 3 ? '#be123c' : '#71717a' }}>
                      逾期 {item.ageDays} 天
                    </span>
                  </div>
                </div>
                <span className="hidden shrink-0 rounded-full px-2 py-1 text-[10px] font-bold sm:inline-flex" style={{ background: meta.bg, color: meta.color }}>
                  {overdueStatusLabel[item.status]}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: '#a1a1aa' }} />
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
