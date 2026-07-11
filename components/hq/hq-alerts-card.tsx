'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Loader2,
} from 'lucide-react'
import { fetchHQAlerts, type HQAlerts } from '@/app/actions/hq-alerts'

type AlertItem = { id: string; name: string }

type WorkSection = {
  key: string
  label: string
  description: string
  items: AlertItem[]
  tone: 'red' | 'amber' | 'blue' | 'green'
  emptyLabel: string
  href: (item: AlertItem, date: string) => string
}

const toneStyle = {
  red: {
    border: '#fecdd3',
    bg: '#fff1f2',
    text: '#be123c',
    badgeBg: '#ffe4e6',
  },
  amber: {
    border: '#fed7aa',
    bg: '#fff7ed',
    text: '#c2410c',
    badgeBg: '#ffedd5',
  },
  blue: {
    border: '#bfdbfe',
    bg: '#eff6ff',
    text: '#1d4ed8',
    badgeBg: '#dbeafe',
  },
  green: {
    border: '#bbf7d0',
    bg: '#f0fdf4',
    text: '#047857',
    badgeBg: '#dcfce7',
  },
}

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

  const storeHref = (item: AlertItem, date: string) => (
    `/hq/accounting?tab=store&storeId=${encodeURIComponent(item.id)}&date=${encodeURIComponent(date)}`
  )
  const ckHref = (item: AlertItem, date: string) => (
    `/hq/accounting?tab=ck&ckStoreId=${encodeURIComponent(item.id)}&date=${encodeURIComponent(date)}`
  )

  const sections: WorkSection[] = [
    {
      key: 'store-not-closed',
      label: '店家未結帳',
      description: '今天還沒有送出帳目，需要先催店長完成。',
      items: alerts.storeNotClosed,
      tone: 'red',
      emptyLabel: '店家都有建立帳目',
      href: storeHref,
    },
    {
      key: 'store-draft',
      label: '店家草稿中',
      description: '已開始填寫但尚未送出，通常是卡在流程中。',
      items: alerts.storeInDraft,
      tone: 'amber',
      emptyLabel: '沒有店家停在草稿',
      href: storeHref,
    },
    {
      key: 'store-review',
      label: '店家待審核',
      description: '店家已送出，總公司可直接進帳目中心審核。',
      items: alerts.storePendingReview,
      tone: 'blue',
      emptyLabel: '沒有店家等待審核',
      href: storeHref,
    },
    {
      key: 'store-dispute',
      label: '店家退回中',
      description: '帳目已退回，需追蹤店家是否完成修改。',
      items: alerts.storeInDispute,
      tone: 'red',
      emptyLabel: '沒有退回中的店家',
      href: storeHref,
    },
    {
      key: 'ck-not-submitted',
      label: '央廚未送出',
      description: '央廚帳目還沒送出，會影響各店食材成本核對。',
      items: alerts.ckNotSubmitted,
      tone: 'red',
      emptyLabel: '央廚都有送出',
      href: ckHref,
    },
    {
      key: 'ck-review',
      label: '央廚待審核',
      description: '央廚已送出，總公司可審核或退回修改。',
      items: alerts.ckPendingReview,
      tone: 'blue',
      emptyLabel: '沒有央廚等待審核',
      href: ckHref,
    },
    {
      key: 'ck-dispute',
      label: '央廚退回中',
      description: '央廚帳目已退回，需確認是否完成修正。',
      items: alerts.ckInDispute,
      tone: 'amber',
      emptyLabel: '沒有央廚退回中',
      href: ckHref,
    },
    {
      key: 'ck-handoff',
      label: '央廚待點交',
      description: '公司已付款，但央廚尚未確認點交完成。',
      items: alerts.ckHandoffPending,
      tone: 'green',
      emptyLabel: '沒有待點交項目',
      href: ckHref,
    },
  ]

  const activeSections = sections.filter(section => section.items.length > 0)
  const totalIssues = activeSections.reduce((sum, section) => sum + section.items.length, 0)
  const storeDoneText = `${alerts.storeCompleted}/${Math.max(alerts.totalStores, 0)}`
  const ckDoneText = `${alerts.ckCompleted}/${Math.max(alerts.totalCkStores, 0)}`

  if (totalIssues === 0) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#047857' }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold">今日作業完成</p>
              <p className="mt-1 text-sm">店家與央廚目前沒有需要追蹤的帳務項目。</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusPill label="店家已審核" value={storeDoneText} />
            <StatusPill label="央廚已審核" value={ckDoneText} />
            <Link
              href={`/hq/accounting?date=${encodeURIComponent(alerts.today)}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 font-bold hover:bg-emerald-50"
              style={{ border: '1px solid #bbf7d0', color: '#047857' }}
            >
              查看帳目
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ background: '#fffaf3', border: '1px solid #fed7aa' }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white" style={{ color: '#c2410c' }}>
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold" style={{ color: '#7c2d12' }}>今日待處理工作台</p>
              <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: '#ffedd5', color: '#c2410c' }}>
                {alerts.today}
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: '#78716c' }}>
              目前有 {totalIssues} 件需要追蹤，點店名可直接進到對應日期的帳目。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/hq/accounting?tab=store&date=${encodeURIComponent(alerts.today)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold hover:bg-orange-50"
            style={{ border: '1px solid #fed7aa', color: '#c2410c' }}
          >
            店家帳目
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/hq/accounting?tab=ck&date=${encodeURIComponent(alerts.today)}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold hover:bg-orange-50"
            style={{ border: '1px solid #fed7aa', color: '#c2410c' }}
          >
            央廚帳目
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[260px_1fr]">
        <div className="space-y-3 rounded-xl bg-white p-3" style={{ border: '1px solid #fed7aa' }}>
          <ProgressRow label="店家已審核" value={storeDoneText} />
          <ProgressRow label="央廚已審核" value={ckDoneText} />
          <div className="rounded-lg p-3" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#9a3412' }}>
              <Clock3 className="h-4 w-4" />
              今日優先順序
            </div>
            <p className="mt-2 text-xs leading-5" style={{ color: '#78716c' }}>
              先處理待審核，再追未送出與草稿。退回中的帳目需要確認店家或央廚是否已修改。
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {activeSections.map(section => (
            <ActionSection key={section.key} section={section} date={alerts.today} />
          ))}
          {sections.filter(section => section.items.length === 0).slice(0, 2).map(section => (
            <CompletedSection key={section.key} section={section} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 font-bold">
      <span className="text-xs opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  )
}

function ProgressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#fafafa' }}>
      <span className="text-sm" style={{ color: '#71717a' }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: '#18181b' }}>{value}</span>
    </div>
  )
}

function ActionSection({ section, date }: { section: WorkSection; date: string }) {
  const style = toneStyle[section.tone]

  return (
    <div className="rounded-xl bg-white p-3" style={{ border: `1px solid ${style.border}` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold" style={{ color: style.text }}>{section.label}</p>
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: style.badgeBg, color: style.text }}>
              {section.items.length}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5" style={{ color: '#71717a' }}>{section.description}</p>
        </div>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: style.text }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {section.items.map(item => (
          <Link
            key={item.id}
            href={section.href(item, date)}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold hover:brightness-95"
            style={{ border: `1px solid ${style.border}`, color: '#3f3f46' }}
          >
            {item.name}
            <ArrowRight className="h-3.5 w-3.5" style={{ color: style.text }} />
          </Link>
        ))}
      </div>
    </div>
  )
}

function CompletedSection({ section }: { section: WorkSection }) {
  return (
    <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #e5e7eb' }}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" style={{ color: '#059669' }} />
        <p className="text-sm font-bold" style={{ color: '#3f3f46' }}>{section.label}</p>
      </div>
      <p className="mt-1 text-xs" style={{ color: '#71717a' }}>{section.emptyLabel}</p>
    </div>
  )
}
