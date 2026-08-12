'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, FileText, Loader2, Plus, Save, Settings2, Store, Target, Trash2,
} from 'lucide-react'
import { createMeetingReport, deleteMeetingReport, type MeetingRevenueComparison } from '@/app/actions/meeting-reports'
import { updateMeetingSchedule } from '@/app/actions/meeting-schedule'

interface ReportRow {
  id: string
  period_start: string
  period_end: string
  meeting_date: string | null
  status: 'draft' | 'submitted'
  current_step?: number
  updated_at: string
}

interface Props {
  storeId: string
  storeName: string
  meetingAnchorDate: string | null
  meetingFrequencyDays: number
  reports: ReportRow[]
  dashboardPeriod: { start: string; end: string }
  dashboardComparison: MeetingRevenueComparison | null
  openActionCount: number
}

function todayInTaipei() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function calculateNextMeeting(anchorDate: string | null, frequency: number) {
  if (!anchorDate) return null
  const today = todayInTaipei()
  let next = new Date(`${anchorDate}T12:00:00+08:00`)
  const todayDate = new Date(`${today}T12:00:00+08:00`)
  while (next < todayDate) next = new Date(next.getTime() + frequency * 86400000)
  const date = next.toISOString().slice(0, 10)
  return {
    date,
    weekday: ['日', '一', '二', '三', '四', '五', '六'][next.getDay()],
    daysUntil: Math.round((next.getTime() - todayDate.getTime()) / 86400000),
  }
}

function money(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function trend(current: number, previous: number) {
  if (previous === 0) return { label: current > 0 ? '本期新增' : '—', value: null as number | null }
  const value = ((current - previous) / previous) * 100
  return { label: `${value > 0 ? '+' : ''}${value.toFixed(1)}%`, value }
}

export default function MeetingReportListClient({
  storeId,
  storeName,
  meetingAnchorDate,
  meetingFrequencyDays,
  reports,
  dashboardPeriod,
  dashboardComparison,
  openActionCount,
}: Props) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'submitted'>('all')
  const [showSchedule, setShowSchedule] = useState(false)
  const [anchorDate, setAnchorDate] = useState(meetingAnchorDate ?? '')
  const [frequency, setFrequency] = useState(meetingFrequencyDays)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const nextMeeting = useMemo(() => calculateNextMeeting(anchorDate || null, frequency), [anchorDate, frequency])
  const [meetingDate, setMeetingDate] = useState(
    () => calculateNextMeeting(meetingAnchorDate, meetingFrequencyDays)?.date ?? todayInTaipei(),
  )

  const years = useMemo(() => Array.from(new Set(reports.map(report => report.period_end.slice(0, 4)))).sort().reverse(), [reports])
  const filteredReports = useMemo(() => reports.filter(report => {
    if (yearFilter !== 'all' && !report.period_end.startsWith(yearFilter)) return false
    if (statusFilter !== 'all' && report.status !== statusFilter) return false
    return true
  }), [reports, statusFilter, yearFilter])

  async function saveSchedule() {
    setSavingSchedule(true)
    try {
      const result = await updateMeetingSchedule(storeId, {
        meeting_anchor_date: anchorDate || null,
        meeting_frequency_days: frequency,
      })
      if ('error' in result) return toast.error(result.error)
      toast.success('會議排程已儲存')
      setShowSchedule(false)
      const calculated = calculateNextMeeting(anchorDate || null, frequency)
      if (calculated) setMeetingDate(calculated.date)
      router.refresh()
    } finally {
      setSavingSchedule(false)
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const result = await createMeetingReport(storeId, meetingDate)
      if ('error' in result) return toast.error(result.error)
      router.push(`/manager/meeting-report/${result.id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(reportId: string) {
    if (!confirm('確定刪除這份會議報告？刪除後無法復原。')) return
    setDeletingId(reportId)
    try {
      const result = await deleteMeetingReport(reportId)
      if ('error' in result) return toast.error(result.error)
      toast.success('會議報告已刪除')
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  const metrics = dashboardComparison ? [
    { label: '總營業額', current: dashboardComparison.current.total, previous: dashboardComparison.previous.total, icon: BarChart3 },
    { label: '現場', current: dashboardComparison.current.onsite, previous: dashboardComparison.previous.onsite, icon: Store },
    { label: 'Uber Eats', current: dashboardComparison.current.uber, previous: dashboardComparison.previous.uber, icon: ArrowRight },
    { label: 'foodpanda', current: dashboardComparison.current.panda, previous: dashboardComparison.previous.panda, icon: ArrowRight },
    { label: '線上點餐', current: dashboardComparison.current.online, previous: dashboardComparison.previous.online, icon: ArrowRight },
  ] : []

  const draftCount = reports.filter(report => report.status === 'draft').length

  return (
    <div className="min-h-full bg-[#fafafa] pb-24 lg:pb-10">
      <header className="border-b border-zinc-100 bg-white px-5 py-5 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-semibold text-orange-600">店務管理</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 lg:text-3xl">雙週店務會議</h1>
            <p className="mt-1 text-sm text-zinc-500">{storeName} · 統一營業數據、營運回顧與改善追蹤</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSchedule(value => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            <Settings2 className="h-4 w-4" />會議排程
            <ChevronDown className={`h-4 w-4 transition ${showSchedule ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 lg:px-8">
        {showSchedule && (
          <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 lg:p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="text-sm font-semibold text-zinc-700">
                基準會議日
                <input type="date" value={anchorDate} onChange={event => setAnchorDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 font-normal outline-none focus:border-orange-400" />
                <span className="mt-1 block text-xs font-normal text-zinc-500">任選一次實際會議日，系統會依頻率推算</span>
              </label>
              <label className="text-sm font-semibold text-zinc-700">
                會議頻率
                <select value={frequency} onChange={event => setFrequency(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 font-normal outline-none focus:border-orange-400">
                  <option value={7}>每週</option>
                  <option value={14}>每兩週</option>
                  <option value={21}>每三週</option>
                  <option value={30}>每月</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-zinc-500">每間店可以設定不同日期與頻率</span>
              </label>
              <button type="button" onClick={saveSchedule} disabled={savingSchedule} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60">
                {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}儲存排程
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><CalendarDays className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-bold text-zinc-900">本次比較區間</p>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {dashboardPeriod.start.replaceAll('-', '/')} → {dashboardPeriod.end.replaceAll('-', '/')}
                  {dashboardComparison && <>　vs　{dashboardComparison.previousStart.replaceAll('-', '/')} → {dashboardComparison.previousEnd.replaceAll('-', '/')}</>}
                </p>
              </div>
            </div>
            {nextMeeting && (
              <div className="rounded-xl bg-zinc-50 px-4 py-2 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-900">下次會議：</span>{nextMeeting.date.replaceAll('-', '/')}（{nextMeeting.weekday}）
                <span className="ml-2 text-xs text-zinc-400">{nextMeeting.daysUntil === 0 ? '今天' : `${nextMeeting.daysUntil} 天後`}</span>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.length > 0 ? metrics.map(metric => {
            const change = trend(metric.current, metric.previous)
            const Icon = metric.icon
            const trendColor = change.value === null ? 'text-zinc-400' : change.value >= 0 ? 'text-emerald-600' : 'text-rose-600'
            return (
              <article key={metric.label} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-sm font-semibold">{metric.label}</span><Icon className="h-4 w-4 text-orange-500" />
                </div>
                <p className="mt-3 text-xl font-extrabold tabular-nums tracking-tight text-zinc-900">{money(metric.current)}</p>
                <p className={`mt-1 text-sm font-bold tabular-nums ${trendColor}`}>{change.label}<span className="ml-1 text-xs font-normal text-zinc-400">較前期</span></p>
              </article>
            )
          }) : (
            <div className="col-span-full rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">目前區間尚無營業資料</div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.5fr)]">
          <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[190px] flex-1 text-sm font-semibold text-zinc-700">
                本次會議日期
                <input type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 font-normal outline-none focus:border-orange-400" />
              </label>
              <button type="button" onClick={handleCreate} disabled={creating || !meetingDate} className="inline-flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}建立本次報告
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">營業區間將自動設定為會議日前一天往回 14 天，建立後仍可調整。</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <Target className="h-5 w-5 text-orange-500" />
              <p className="mt-3 text-2xl font-extrabold text-zinc-900">{openActionCount}</p>
              <p className="text-xs text-zinc-500">待追蹤改善事項</p>
            </div>
            <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <Clock3 className="h-5 w-5 text-amber-500" />
              <p className="mt-3 text-2xl font-extrabold text-zinc-900">{draftCount}</p>
              <p className="text-xs text-zinc-500">尚未提交草稿</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">歷史會議報告</h2>
              <p className="mt-0.5 text-xs text-zinc-500">所有草稿、已提交報告與改善紀錄都會保留</p>
            </div>
            <div className="flex gap-2">
              <select value={yearFilter} onChange={event => setYearFilter(event.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs outline-none">
                <option value="all">全部年份</option>
                {years.map(year => <option key={year} value={year}>{year} 年</option>)}
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs outline-none">
                <option value="all">全部狀態</option><option value="draft">草稿</option><option value="submitted">已提交</option>
              </select>
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <FileText className="mx-auto h-10 w-10 text-zinc-300" />
              <p className="mt-3 text-sm font-semibold text-zinc-600">還沒有符合條件的會議報告</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredReports.map(report => {
                const submitted = report.status === 'submitted'
                const progress = submitted ? 100 : Math.max(20, Math.min(100, (report.current_step ?? 1) * 20))
                return (
                  <div key={report.id} className="flex items-center gap-3 p-4 transition hover:bg-zinc-50/70 lg:px-5">
                    <Link href={`/manager/meeting-report/${report.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${submitted ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                        {submitted ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-zinc-900">{(report.meeting_date ?? report.period_end).replaceAll('-', '/')} 會議</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{submitted ? '已提交' : '草稿'}</span>
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">比較區間 {report.period_start.replaceAll('-', '/')} → {report.period_end.replaceAll('-', '/')}</span>
                        <span className="mt-2 block h-1.5 max-w-xs overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full bg-orange-500" style={{ width: `${progress}%` }} /></span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                    </Link>
                    <button type="button" onClick={() => handleDelete(report.id)} disabled={deletingId === report.id} aria-label="刪除報告" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                      {deletingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
