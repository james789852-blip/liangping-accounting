'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, Check,
  CheckCircle2, FileDown, Loader2, MessageSquare, Plus,
  RefreshCw, Save, Send, Store, Target, Trash2, UserRound, Users, X,
} from 'lucide-react'
import SectionPhotoGrid from '@/components/manager/section-photo-grid'
import SubmittedReportView from './submitted-report-view'
import {
  addActionItem,
  deleteActionItem,
  getMeetingRevenueComparison,
  resolveActionItem,
  submitMeetingReport,
  unsubmitMeetingReport,
  updateActionItem,
  updateActionItemProgress,
  updateMeetingReport,
  type ActionItem,
  type ActionItemDetails,
  type ComplaintEntry,
  type DailyRevenueSummary,
  type GoogleReviewEntry,
  type MeetingReport,
  type MeetingRevenueComparison,
  type StaffMemberAnalysis,
  type StoreDeliveryEntry,
  type VendorIssue,
} from '@/app/actions/meeting-reports'
import { googleReviewAggregate, normalizeGoogleReviewEntries } from '@/lib/meeting-google-reviews'
import { complaintAggregate, normalizeComplaintEntries } from '@/lib/meeting-complaints'
import { isProgressConfirmedForReport, progressForTrackingStatus, trackingStatusForProgress, type TrackingStatus } from '@/lib/meeting-action-progress'
import { normalizeStoreDeliveryEntries, storeDeliveryMap } from '@/lib/meeting-store-delivery'

interface Props {
  report: MeetingReport
  storeName: string
  isFirstReport: boolean
  thisReportItems: ActionItem[]
  carryOverItems: ActionItem[]
  initialComparison: MeetingRevenueComparison | null
}

const STEPS = [
  { id: 1, label: '營運分析', icon: BarChart3 },
  { id: 2, label: '營運回顧', icon: MessageSquare },
  { id: 3, label: '改善追蹤', icon: Target },
  { id: 4, label: '問題與解法', icon: Users },
  { id: 5, label: '確認送出', icon: CheckCircle2 },
]

const EMPTY_DETAILS: ActionItemDetails = {
  proposer_name: '',
  proposer_role: '店長',
  observation: '',
  impact: '',
  cause: '',
  solution: '',
  verification_method: '',
}

function plainText(html: string | null | undefined) {
  if (!html) return ''
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function staffPerformanceNotes(member: StaffMemberAnalysis) {
  return [member.strengths.trim(), member.concerns.trim()].filter(Boolean).join('\n')
}

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00+08:00`)
  value.setDate(value.getDate() + amount)
  return value.toISOString().slice(0, 10)
}

function dateRange(start: string, end: string) {
  const dates: string[] = []
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date)
  return dates
}

function applyStoreDeliveryToComparison(comparison: MeetingRevenueComparison, entries: StoreDeliveryEntry[]): MeetingRevenueComparison {
  const amounts = storeDeliveryMap(entries)
  const updatePeriod = (period: MeetingRevenueComparison['current']) => {
    const daily = period.daily.map(row => {
      const storeDelivery = amounts.get(row.date) ?? 0
      const hasSystemData = row.hasSystemData ?? row.hasData
      return {
        ...row,
        total: row.total - (row.storeDelivery ?? 0) + storeDelivery,
        storeDelivery,
        deliveryTotal: row.uber + row.panda + storeDelivery,
        hasSystemData,
        hasData: hasSystemData || storeDelivery > 0,
      }
    })
    return {
      ...period,
      total: daily.reduce((sum, row) => sum + row.total, 0),
      storeDelivery: daily.reduce((sum, row) => sum + row.storeDelivery, 0),
      deliveryTotal: daily.reduce((sum, row) => sum + row.deliveryTotal, 0),
      operatingDays: daily.filter(row => row.hasData).length,
      daily,
    }
  }
  return { ...comparison, current: updatePeriod(comparison.current), previous: updatePeriod(comparison.previous) }
}

function normalizeReport(report: MeetingReport): MeetingReport {
  const comparisonEnd = report.comparison_period_end ?? shiftDate(report.period_start, -1)
  const periodDays = Math.round((new Date(report.period_end).getTime() - new Date(report.period_start).getTime()) / 86400000) + 1
  const googleReviewData = report.google_review_data ?? {
    new_reviews: 0,
    average_rating: null,
    summary: plainText(report.customer_feedback_html),
    reviews: [],
  }
  return {
    ...report,
    comparison_period_start: report.comparison_period_start ?? shiftDate(comparisonEnd, -(periodDays - 1)),
    comparison_period_end: comparisonEnd,
    revenue_difference_note: report.revenue_difference_note ?? plainText(report.operations_review_html),
    store_delivery_data: normalizeStoreDeliveryEntries(report.store_delivery_data),
    google_review_data: {
      ...googleReviewData,
      reviews: normalizeGoogleReviewEntries(googleReviewData.reviews),
    },
    complaint_data: {
      ...(report.complaint_data ?? { count: 0, category: '', description: '', resolution: '', complaints: [] }),
      complaints: normalizeComplaintEntries(report.complaint_data?.complaints),
    },
    vendor_issues: report.vendor_issues ?? [],
    staff_overview: report.staff_overview ?? {
      staffing_status: '正常',
      training_needs: '',
      note: plainText(report.staff_status_html),
    },
    staff_members: report.staff_members ?? [],
    presenters: report.presenters ?? [],
    current_step: report.current_step ?? 1,
    customer_feedback_photos: report.customer_feedback_photos ?? [],
    staff_status_photos: report.staff_status_photos ?? [],
    product_quality_photos: report.product_quality_photos ?? [],
    notes_photos: report.notes_photos ?? [],
  }
}

function normalizeItem(item: ActionItem): ActionItem {
  return {
    ...item,
    details: { ...EMPTY_DETAILS, ...(item.details ?? {}) },
    progress_percent: item.progress_percent ?? (item.status === 'resolved' ? 100 : 0),
    store_support_note: item.store_support_note ?? item.hq_support_note ?? null,
    photos: item.photos ?? [],
  }
}

function isInitialTrackingItem(item: ActionItem) {
  return Boolean(item.details?.is_initial_tracking)
}

function money(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function signedMoney(value: number) {
  if (value === 0) return 'NT$ 0'
  return `${value > 0 ? '+' : '-'}NT$ ${Math.abs(Math.round(value)).toLocaleString('zh-TW')}`
}

function trend(current: number, previous: number) {
  if (previous === 0) return { label: current > 0 ? '本期新增' : '—', positive: null as boolean | null }
  const value = ((current - previous) / previous) * 100
  return { label: `${value > 0 ? '+' : ''}${value.toFixed(1)}%`, positive: value >= 0 }
}

export default function EditClient({
  report: initialReport,
  storeName,
  isFirstReport,
  thisReportItems,
  carryOverItems,
  initialComparison,
}: Props) {
  const [report, setReport] = useState(() => normalizeReport(initialReport))
  const [proposals, setProposals] = useState(() => thisReportItems.map(normalizeItem))
  const [carryItems, setCarryItems] = useState(() => carryOverItems.map(normalizeItem))
  const [comparison, setComparison] = useState(initialComparison)
  const [activeStep, setActiveStep] = useState(Math.max(1, Math.min(initialReport.current_step ?? 1, 5)))
  const [savingCount, setSavingCount] = useState(0)
  const [refreshingRevenue, setRefreshingRevenue] = useState(false)
  const [addingProposal, setAddingProposal] = useState(false)
  const [addingTracking, setAddingTracking] = useState(false)
  const [pending, startTransition] = useTransition()
  const reportTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const itemTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const isSubmitted = report.status === 'submitted'

  async function persistReport(field: keyof MeetingReport, value: unknown) {
    setSavingCount(count => count + 1)
    try {
      const result = await updateMeetingReport(report.id, { [field]: value })
      if ('error' in result) toast.error(result.error)
    } finally {
      setSavingCount(count => Math.max(0, count - 1))
    }
  }

  function updateReportField<K extends keyof MeetingReport>(field: K, value: MeetingReport[K], delay = 650) {
    setReport(current => ({ ...current, [field]: value }))
    const key = String(field)
    if (reportTimers.current[key]) clearTimeout(reportTimers.current[key])
    reportTimers.current[key] = setTimeout(() => persistReport(field, value), delay)
  }

  function updateComparisonDate(
    field: 'period_start' | 'period_end' | 'comparison_period_start' | 'comparison_period_end',
    value: string,
  ) {
    setComparison(null)
    updateReportField(field, value, 0)
  }

  function updateStoreDelivery(date: string, amount: number) {
    const next = normalizeStoreDeliveryEntries([
      ...report.store_delivery_data.filter(entry => entry.date !== date),
      { date, amount },
    ])
    updateReportField('store_delivery_data', next)
    setComparison(current => current ? applyStoreDeliveryToComparison(current, next) : current)
  }

  function replaceGoogleReviews(reviews: GoogleReviewEntry[]) {
    const aggregate = googleReviewAggregate(reviews)
    updateReportField('google_review_data', {
      ...report.google_review_data,
      reviews,
      new_reviews: aggregate.newReviews,
      average_rating: aggregate.averageRating,
      summary: aggregate.summary,
    })
  }

  function addGoogleReview() {
    const carryLegacySummary = report.google_review_data.reviews.length === 0
      ? report.google_review_data.summary.trim()
      : ''
    replaceGoogleReviews([...report.google_review_data.reviews, {
      id: crypto.randomUUID(),
      rating: null,
      comment: carryLegacySummary,
      explanation: '',
      photos: [],
    }])
  }

  function updateGoogleReview(id: string, patch: Partial<Omit<GoogleReviewEntry, 'id'>>) {
    replaceGoogleReviews(report.google_review_data.reviews.map(review =>
      review.id === id ? { ...review, ...patch } : review,
    ))
  }

  function removeGoogleReview(id: string) {
    replaceGoogleReviews(report.google_review_data.reviews.filter(review => review.id !== id))
  }

  function replaceComplaints(complaints: ComplaintEntry[]) {
    const aggregate = complaintAggregate(complaints)
    updateReportField('complaint_data', {
      ...report.complaint_data,
      complaints,
      ...aggregate,
    })
  }

  function addComplaint() {
    const carryLegacyData = report.complaint_data.complaints.length === 0
      && (report.complaint_data.category.trim() || report.complaint_data.description.trim() || report.complaint_data.resolution.trim())
    replaceComplaints([...report.complaint_data.complaints, {
      id: crypto.randomUUID(),
      category: carryLegacyData ? report.complaint_data.category : '',
      description: carryLegacyData ? report.complaint_data.description : '',
      resolution: carryLegacyData ? report.complaint_data.resolution : '',
      photos: [],
    }])
  }

  function updateComplaint(id: string, patch: Partial<Omit<ComplaintEntry, 'id'>>) {
    replaceComplaints(report.complaint_data.complaints.map(complaint =>
      complaint.id === id ? { ...complaint, ...patch } : complaint,
    ))
  }

  function removeComplaint(id: string) {
    replaceComplaints(report.complaint_data.complaints.filter(complaint => complaint.id !== id))
  }

  async function persistItem(itemId: string, field: string, value: unknown) {
    setSavingCount(count => count + 1)
    try {
      const result = await updateActionItem(itemId, { [field]: value })
      if ('error' in result) toast.error(result.error)
    } finally {
      setSavingCount(count => Math.max(0, count - 1))
    }
  }

  function updateProposal(itemId: string, field: keyof ActionItem, value: unknown, delay = 650) {
    setProposals(items => items.map(item => item.id === itemId ? { ...item, [field]: value } : item))
    queueItemSave(itemId, String(field), value, delay)
  }

  function updateCarry(itemId: string, field: keyof ActionItem, value: unknown, delay = 650) {
    setCarryItems(items => items.map(item => item.id === itemId ? { ...item, [field]: value } : item))
    queueItemSave(itemId, String(field), value, delay)
  }

  function queueItemSave(itemId: string, field: string, value: unknown, delay: number) {
    const key = `${itemId}:${field}`
    if (itemTimers.current[key]) clearTimeout(itemTimers.current[key])
    itemTimers.current[key] = setTimeout(() => persistItem(itemId, field, value), delay)
  }

  function changeStep(step: number) {
    setActiveStep(step)
    if (!isSubmitted && step > report.current_step) updateReportField('current_step', step, 0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function refreshRevenue() {
    setRefreshingRevenue(true)
    try {
      const result = await getMeetingRevenueComparison(
        report.store_id,
        report.period_start,
        report.period_end,
        report.comparison_period_start,
        report.comparison_period_end,
        report.store_delivery_data,
      )
      if ('error' in result) return toast.error(result.error)
      setComparison(result)
      toast.success('已更新營運分析資料')
    } finally {
      setRefreshingRevenue(false)
    }
  }

  function updateVendorIssue(issueId: string, field: keyof VendorIssue, value: string) {
    updateReportField('vendor_issues', report.vendor_issues.map(issue => issue.id === issueId ? { ...issue, [field]: value } : issue))
  }

  function addVendorIssue() {
    updateReportField('vendor_issues', [...report.vendor_issues, {
      id: crypto.randomUUID(), vendor: '', item: '', issue: '', status: '待處理',
    }])
  }

  function removeVendorIssue(issueId: string) {
    updateReportField('vendor_issues', report.vendor_issues.filter(issue => issue.id !== issueId))
  }

  function addStaffMember() {
    updateReportField('staff_members', [...report.staff_members, {
      id: crypto.randomUUID(),
      name: '',
      role: '',
      current_status: '穩定',
      strengths: '',
      concerns: '',
      action_plan: '',
    }])
  }

  function updateStaffMember(memberId: string, patch: Partial<StaffMemberAnalysis>) {
    updateReportField('staff_members', report.staff_members.map(member => member.id === memberId ? { ...member, ...patch } : member))
  }

  function removeStaffMember(memberId: string) {
    updateReportField('staff_members', report.staff_members.filter(member => member.id !== memberId))
  }

  async function addProposal() {
    setAddingProposal(true)
    try {
      const result = await addActionItem(report.id, report.store_id, {
        description: '待補充問題',
        details: {
          proposer_name: '',
        },
      })
      if ('error' in result) return toast.error(result.error)
      setProposals(items => [...items, normalizeItem(result.item)])
    } finally {
      setAddingProposal(false)
    }
  }

  async function addInitialTracking() {
    setAddingTracking(true)
    try {
      const reusableProposal = proposals.find(item =>
        item.description === '待補充問題'
        && !item.details.proposer_name.trim()
        && !item.details.observation.trim()
        && !item.details.solution.trim(),
      )
      if (reusableProposal) {
        const details = { ...reusableProposal.details, is_initial_tracking: true }
        const result = await updateActionItem(reusableProposal.id, { description: '待補充追蹤問題', details })
        if ('error' in result) return toast.error(result.error)
        setProposals(items => items.filter(item => item.id !== reusableProposal.id))
        setCarryItems(items => [...items, normalizeItem({ ...reusableProposal, description: '待補充追蹤問題', details })])
        return
      }
      const result = await addActionItem(report.id, report.store_id, {
        description: '待補充追蹤問題',
        details: { is_initial_tracking: true },
      })
      if ('error' in result) return toast.error(result.error)
      setCarryItems(items => [...items, normalizeItem(result.item)])
    } finally {
      setAddingTracking(false)
    }
  }

  async function removeInitialTracking(itemId: string) {
    if (!confirm('確定刪除這項首次追蹤問題？')) return
    const result = await deleteActionItem(itemId)
    if ('error' in result) return toast.error(result.error)
    setCarryItems(items => items.filter(item => item.id !== itemId))
  }

  async function removeProposal(itemId: string) {
    if (!confirm('確定刪除這項問題提案？')) return
    const result = await deleteActionItem(itemId)
    if ('error' in result) return toast.error(result.error)
    setProposals(items => items.filter(item => item.id !== itemId))
  }

  async function updateCarryStatus(item: ActionItem, status: TrackingStatus) {
    const progressKey = `${item.id}:progress-state`
    if (itemTimers.current[progressKey]) clearTimeout(itemTimers.current[progressKey])
    const result = await resolveActionItem(item.id, report.id, item.resolution_note ?? '', status)
    if ('error' in result) return toast.error(result.error)
    const nextProgress = progressForTrackingStatus(status, item.progress_percent)
    setCarryItems(items => items.map(current => current.id === item.id
      ? { ...current, status, progress_percent: nextProgress, details: { ...current.details, progress_confirmed_report_id: report.id } }
      : current))
  }

  function updateCarryProgress(item: ActionItem, progressPercent: number) {
    const status = trackingStatusForProgress(progressPercent)
    setCarryItems(items => items.map(current => current.id === item.id
      ? { ...current, progress_percent: progressPercent, status, details: { ...current.details, progress_confirmed_report_id: report.id } }
      : current))
    const key = `${item.id}:progress-state`
    if (itemTimers.current[key]) clearTimeout(itemTimers.current[key])
    const persistProgress = async () => {
      setSavingCount(count => count + 1)
      try {
        const result = await updateActionItemProgress(item.id, report.id, progressPercent)
        if ('error' in result) toast.error(result.error)
      } finally {
        setSavingCount(count => Math.max(0, count - 1))
      }
    }
    if (!isProgressConfirmedForReport(item.details, report.id)) {
      void persistProgress()
    } else {
      itemTimers.current[key] = setTimeout(persistProgress, 650)
    }
  }

  function exportPdf() {
    const anchor = document.createElement('a')
    anchor.href = `/api/meeting-report/${report.id}/pdf?downloadedAt=${Date.now()}`
    anchor.download = `會議報告_${report.period_start}_${report.period_end}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitMeetingReport(report.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setReport(current => ({ ...current, status: 'submitted', current_step: 5 }))
      toast.success('會議報告已提交')
    })
  }

  function handleUnsubmit() {
    startTransition(async () => {
      const result = await unsubmitMeetingReport(report.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setReport(current => ({ ...current, status: 'draft' }))
      toast.success('已改回草稿，可繼續編輯')
    })
  }

  const proposalChecks = useMemo(() => proposals.map(item => ({
    id: item.id,
    complete: Boolean(
      item.details.proposer_name.trim()
      && item.details.observation.trim()
      && item.details.solution.trim()
    ),
  })), [proposals])
  const carryProgressConfirmed = carryItems.every(item => isProgressConfirmedForReport(item.details, report.id))
  const currentInitialItems = carryItems.filter(item => isInitialTrackingItem(item) && item.raised_in_report_id === report.id)
  const canAddInitialTracking = isFirstReport && carryItems.every(item => isInitialTrackingItem(item) && item.raised_in_report_id === report.id)
  const initialTrackingComplete = currentInitialItems.every(item => item.details.observation.trim() && item.details.solution.trim())
  const readiness = [
    { label: '已填寫營業額分析', ok: Boolean(report.revenue_difference_note?.trim()) },
    { label: '至少有一項本次問題與解法', ok: proposals.length > 0 },
    { label: '所有問題提案資料完整', ok: proposals.length > 0 && proposalChecks.every(check => check.complete) },
    ...(currentInitialItems.length > 0 ? [{ label: '首次追蹤問題與處理方式已填完整', ok: initialTrackingComplete }] : []),
    { label: '已確認所有上次改善事項的本次進度', ok: carryProgressConfirmed },
  ]
  const canSubmit = readiness.every(item => item.ok) && savingCount === 0

  if (isSubmitted) {
    return (
      <SubmittedReportView
        report={report}
        storeName={storeName}
        comparison={comparison}
        proposals={proposals}
        carryItems={carryItems}
        pending={pending}
        onExportPdf={exportPdf}
        onUnsubmit={handleUnsubmit}
      />
    )
  }

  return (
    <div className="min-h-full bg-[#fafafa] pb-32 lg:pb-10">
      <header className="border-b border-zinc-100 bg-white px-4 py-4 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/manager/meeting-report" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-3.5 w-3.5" />返回會議總覽</Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">建立雙週會議報告</h1>
              <p className="mt-1 text-sm text-zinc-500">{storeName} · 會議日期 {(report.meeting_date ?? report.period_end).replaceAll('-', '/')}</p>
            </div>
            <div className="flex items-center gap-2">
              {savingCount > 0 ? <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中</span> : <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />已自動儲存</span>}
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isSubmitted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{isSubmitted ? '已提交' : '草稿'}</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-20 border-b border-zinc-100 bg-white/95 px-2 py-3 backdrop-blur lg:top-0 lg:px-8">
        <div className="mx-auto flex max-w-7xl overflow-x-auto">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const active = activeStep === step.id
            const completed = step.id < activeStep || report.current_step > step.id
            return (
              <button key={step.id} type="button" onClick={() => changeStep(step.id)} className="group flex min-w-[120px] flex-1 items-center">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${active ? 'border-orange-600 bg-orange-600 text-white' : completed ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-zinc-200 bg-white text-zinc-400'}`}>
                  {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className={`ml-2 whitespace-nowrap text-xs font-bold ${active ? 'text-orange-600' : 'text-zinc-500'}`}>{step.label}</span>
                {index < STEPS.length - 1 && <span className={`mx-3 h-px min-w-4 flex-1 ${completed ? 'bg-orange-300' : 'bg-zinc-200'}`} />}
              </button>
            )
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-5 lg:px-8">
        {activeStep === 1 && (
          <div className="space-y-5">
            <SectionHeader number="01" title="營運分析" description="自行選擇兩個獨立區間，比較各通路與每天的營業額，並整理本期營業額分析。" />
            <Card>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
                  <p className="mb-3 text-sm font-extrabold text-orange-700">本期（報告區間）</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="起始日期"><input type="date" value={report.period_start} disabled={isSubmitted} onChange={event => updateComparisonDate('period_start', event.target.value)} className={inputClass} /></Field>
                    <Field label="結束日期"><input type="date" value={report.period_end} disabled={isSubmitted} onChange={event => updateComparisonDate('period_end', event.target.value)} className={inputClass} /></Field>
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
                  <p className="mb-3 text-sm font-extrabold text-sky-700">前期（比較區間）</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="起始日期"><input type="date" value={report.comparison_period_start} disabled={isSubmitted} onChange={event => updateComparisonDate('comparison_period_start', event.target.value)} className={inputClass} /></Field>
                    <Field label="結束日期"><input type="date" value={report.comparison_period_end} disabled={isSubmitted} onChange={event => updateComparisonDate('comparison_period_end', event.target.value)} className={inputClass} /></Field>
                  </div>
                </div>
              </div>
              <div className="mt-1 max-w-sm"><Field label="會議日期"><input type="date" value={report.meeting_date ?? ''} disabled={isSubmitted} onChange={event => updateReportField('meeting_date', event.target.value, 0)} className={inputClass} /></Field></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
                <span><strong className="text-orange-700">本期：</strong>{report.period_start.replaceAll('-', '/')} → {report.period_end.replaceAll('-', '/')}　對比　<strong className="text-sky-700">前期：</strong>{report.comparison_period_start.replaceAll('-', '/')} → {report.comparison_period_end.replaceAll('-', '/')}</span>
                <button type="button" onClick={refreshRevenue} disabled={refreshingRevenue} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshingRevenue ? 'animate-spin' : ''}`} />重新統計</button>
              </div>
            </Card>

            <Card title="店內外送每日金額" icon={<Store className="h-5 w-5" />}>
              <p className="mb-4 text-sm leading-6 text-zinc-500">系統營業資料沒有包含店內自行外送時，可在這裡依日期補登。金額會自動納入總營業額，並與優步、熊貓一起計算外送合計。</p>
              <div className="grid gap-4 xl:grid-cols-2">
                <StoreDeliveryEditor title="本期店內外送" tone="orange" start={report.period_start} end={report.period_end} entries={report.store_delivery_data} disabled={isSubmitted} onChange={updateStoreDelivery} />
                <StoreDeliveryEditor title="前期店內外送" tone="sky" start={report.comparison_period_start} end={report.comparison_period_end} entries={report.store_delivery_data} disabled={isSubmitted} onChange={updateStoreDelivery} />
              </div>
            </Card>

            {comparison ? <><RevenueCards comparison={comparison} /><DailyRevenueComparison comparison={comparison} /></> : <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">日期已變更，請按「重新統計」查看兩個區間的營業資料</div>}

            <Card>
              <Field label="營業額分析" hint="請說明現場、外送平台、店內外送及線上點餐上升或下降的主要原因，例如活動、天氣、商圈人流、外送促銷或人力影響。">
                <textarea value={report.revenue_difference_note ?? ''} disabled={isSubmitted} onChange={event => updateReportField('revenue_difference_note', event.target.value)} rows={6} placeholder="例：本期週末內用來客增加，優步外送同步進行優惠活動，因此整體營業額較前期成長…" className={textareaClass} />
              </Field>
            </Card>
          </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-5">
            <SectionHeader number="02" title="營運回顧" description="所有店家使用相同題型；沒有事件時也可填 0 或「無」。" />
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="網路評論" icon={<MessageSquare className="h-5 w-5" />}>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-semibold text-zinc-500">本期新增評論</p><p className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">{report.google_review_data.new_reviews} 則</p></div>
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-semibold text-zinc-500">平均星等</p><p className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">{report.google_review_data.average_rating ?? '—'} 星</p></div>
                </div>
                {report.google_review_data.reviews.length > 0 ? (
                  <div className="space-y-3">
                    {report.google_review_data.reviews.map((review, index) => (
                      <div key={review.id} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-extrabold text-zinc-800">評論 {index + 1}</p>
                          {!isSubmitted && <button type="button" onClick={() => removeGoogleReview(review.id)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />刪除</button>}
                        </div>
                        <Field label="星等"><select value={review.rating ?? ''} disabled={isSubmitted} onChange={event => updateGoogleReview(review.id, { rating: event.target.value === '' ? null : Number(event.target.value) })} className={inputClass}><option value="">— 選擇星等 —</option><option value="5">5 星</option><option value="4">4 星</option><option value="3">3 星</option><option value="2">2 星</option><option value="1">1 星</option></select></Field>
                        <Field label="評論內容"><textarea value={review.comment} disabled={isSubmitted} onChange={event => updateGoogleReview(review.id, { comment: event.target.value })} rows={3} placeholder="輸入這則網路評論內容…" className={textareaClass} /></Field>
                        <Field label="店家說明／改善方式"><textarea value={review.explanation} disabled={isSubmitted} onChange={event => updateGoogleReview(review.id, { explanation: event.target.value })} rows={3} placeholder="說明原因、處理情況或接下來的改善方式…" className={textareaClass} /></Field>
                        <Field label="照片（每則最多 4 張）"><SectionPhotoGrid storeId={report.store_id} photos={review.photos} onChange={photos => updateGoogleReview(review.id, { photos })} maxPhotos={4} disabled={isSubmitted} /></Field>
                      </div>
                    ))}
                  </div>
                ) : report.google_review_data.summary.trim() ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">舊版主要回饋</p><p className="mt-1 whitespace-pre-wrap leading-6">{report.google_review_data.summary}</p></div>
                ) : <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center text-sm font-semibold text-zinc-400">尚未新增網路評論</div>}
                {!isSubmitted && <button type="button" onClick={addGoogleReview} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-sm font-bold text-orange-700 hover:bg-orange-100"><Plus className="h-4 w-4" />新增一則評論</button>}
              </Card>

              <Card title="客訴紀錄" icon={<AlertCircle className="h-5 w-5" />}>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-semibold text-zinc-500">本期客訴件數</p><p className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">{report.complaint_data.count} 件</p></div>
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"><p className="text-xs font-semibold text-zinc-500">主要類型</p><p className="mt-1 truncate text-xl font-extrabold text-zinc-900">{report.complaint_data.category || '—'}</p></div>
                </div>
                {report.complaint_data.complaints.length > 0 ? (
                  <div className="space-y-3">
                    {report.complaint_data.complaints.map((complaint, index) => (
                      <div key={complaint.id} className="rounded-xl border border-orange-100 bg-orange-50/30 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-extrabold text-zinc-800">客訴 {index + 1}</p>
                          {!isSubmitted && <button type="button" onClick={() => removeComplaint(complaint.id)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />刪除</button>}
                        </div>
                        <Field label="主要類型"><input value={complaint.category} disabled={isSubmitted} onChange={event => updateComplaint(complaint.id, { category: event.target.value })} placeholder="餐點／服務／外送" className={inputClass} /></Field>
                        <Field label="問題說明"><textarea value={complaint.description} disabled={isSubmitted} onChange={event => updateComplaint(complaint.id, { description: event.target.value })} rows={3} placeholder="說明這筆客訴的問題…" className={textareaClass} /></Field>
                        <Field label="處理結果"><textarea value={complaint.resolution} disabled={isSubmitted} onChange={event => updateComplaint(complaint.id, { resolution: event.target.value })} rows={3} placeholder="說明已處理或預計改善的方式…" className={textareaClass} /></Field>
                        <Field label="照片（每筆最多 4 張）"><SectionPhotoGrid storeId={report.store_id} photos={complaint.photos} onChange={photos => updateComplaint(complaint.id, { photos })} maxPhotos={4} disabled={isSubmitted} /></Field>
                      </div>
                    ))}
                  </div>
                ) : (report.complaint_data.category.trim() || report.complaint_data.description.trim() || report.complaint_data.resolution.trim()) ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">舊版客訴紀錄</p><p className="mt-1 whitespace-pre-wrap leading-6">{report.complaint_data.description || '未填寫問題說明'}</p>{report.complaint_data.resolution && <p className="mt-2 border-t border-amber-200 pt-2">處理結果：{report.complaint_data.resolution}</p>}</div>
                ) : <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center text-sm font-semibold text-zinc-400">尚未新增客訴紀錄</div>}
                {!isSubmitted && <button type="button" onClick={addComplaint} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-sm font-bold text-orange-700 hover:bg-orange-100"><Plus className="h-4 w-4" />新增一筆客訴</button>}
              </Card>
            </div>

            <Card title="廠商供貨品質及問題" icon={<Store className="h-5 w-5" />}>
              <div className="space-y-3">
                {report.vendor_issues.map((issue, index) => (
                  <div key={issue.id} className="grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 md:grid-cols-[32px_1fr_1fr_2fr_1fr_36px] md:items-center">
                    <span className="text-center text-xs font-bold text-zinc-400">{index + 1}</span>
                    <input value={issue.vendor} disabled={isSubmitted} onChange={event => updateVendorIssue(issue.id, 'vendor', event.target.value)} placeholder="廠商" className={compactInputClass} />
                    <input value={issue.item} disabled={isSubmitted} onChange={event => updateVendorIssue(issue.id, 'item', event.target.value)} placeholder="品項" className={compactInputClass} />
                    <input value={issue.issue} disabled={isSubmitted} onChange={event => updateVendorIssue(issue.id, 'issue', event.target.value)} placeholder="問題說明" className={compactInputClass} />
                    <select value={issue.status} disabled={isSubmitted} onChange={event => updateVendorIssue(issue.id, 'status', event.target.value)} className={compactInputClass}><option>待處理</option><option>已反映</option><option>改善中</option><option>已改善</option></select>
                    {!isSubmitted && <button type="button" onClick={() => removeVendorIssue(issue.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                {report.vendor_issues.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-400">本期尚未新增供貨問題</p>}
              </div>
              {!isSubmitted && <button type="button" onClick={addVendorIssue} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-orange-300 px-4 text-sm font-bold text-orange-600 hover:bg-orange-50"><Plus className="h-4 w-4" />新增一筆</button>}
              {plainText(initialReport.product_quality_html) && report.vendor_issues.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">舊版產品品質內容：{plainText(initialReport.product_quality_html)}</p>}
              <div className="mt-4"><SectionPhotoGrid storeId={report.store_id} photos={report.product_quality_photos} onChange={photos => updateReportField('product_quality_photos', photos, 0)} disabled={isSubmitted} /></div>
            </Card>

            <Card title="個別同仁分析報告" icon={<UserRound className="h-5 w-5" />}>
              <p className="mb-4 text-xs leading-5 text-zinc-500">只需填寫同仁姓名、目前狀況、表現與觀察，以及後續處理方式。</p>
              <div className="space-y-4">
                {report.staff_members.map((member, index) => (
                  <div key={member.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600">{index + 1}</span>
                        <p className="text-sm font-bold text-zinc-800">{member.name.trim() || `同仁 ${index + 1}`}</p>
                      </div>
                      {!isSubmitted && <button type="button" onClick={() => removeStaffMember(member.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600" aria-label="刪除同仁分析"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="同仁姓名"><input value={member.name} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { name: event.target.value })} placeholder="姓名" className={inputClass} /></Field>
                      <Field label="目前狀況"><select value={member.current_status} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { current_status: event.target.value as StaffMemberAnalysis['current_status'] })} className={inputClass}><option>表現良好</option><option>穩定</option><option>培訓中</option><option>需要關注</option></select></Field>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Field label="表現亮點／需要改善與觀察"><textarea value={staffPerformanceNotes(member)} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { strengths: event.target.value, concerns: '' })} rows={4} placeholder="記錄近期做得好的地方、需要改善或持續觀察的狀況…" className={textareaClass} /></Field>
                      <Field label="預計處理方式"><textarea value={member.action_plan} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { action_plan: event.target.value })} rows={4} placeholder="訓練、面談、排班或追蹤安排…" className={textareaClass} /></Field>
                    </div>
                  </div>
                ))}
                {report.staff_members.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 py-9 text-center text-sm text-zinc-400">尚未新增個別同仁分析</p>}
              </div>
              {!isSubmitted && <button type="button" onClick={addStaffMember} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-orange-300 px-4 text-sm font-bold text-orange-600 hover:bg-orange-50"><Plus className="h-4 w-4" />新增同仁分析</button>}
            </Card>
          </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeader number="03" title="上次改善追蹤" description="每項問題都要留下目前狀況、改善進度、困難與需要的協助。" />{!isSubmitted && canAddInitialTracking && carryItems.length > 0 && <button type="button" onClick={addInitialTracking} disabled={addingTracking} className="inline-flex h-10 items-center gap-2 rounded-xl border border-orange-300 bg-white px-4 text-sm font-bold text-orange-600 hover:bg-orange-50 disabled:opacity-60">{addingTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}新增追蹤問題</button>}</div>
            {carryItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center sm:p-12"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" /><p className="mt-3 font-bold text-zinc-700">目前沒有上次結轉的待改善事項</p>{isFirstReport ? <><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">這是該店第一次建立會議報告，可直接在這一步新增問題、預計處理方式、改善進度與照片，不會跳到下一步。</p>{!isSubmitted && <button type="button" onClick={addInitialTracking} disabled={addingTracking} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">{addingTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}新增第一筆問題與處理方式</button>}</> : <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">上次會議沒有需要延續追蹤的進行中事項，可直接前往下一步填寫本次問題與解法。</p>}</div>
            ) : carryItems.map((item, index) => {
              const progressConfirmed = isProgressConfirmedForReport(item.details, report.id)
              const initialTracking = isInitialTrackingItem(item) && item.raised_in_report_id === report.id
              const updateInitialDetails = (patch: Partial<ActionItemDetails>) => updateCarry(item.id, 'details', { ...item.details, ...patch })
              return <Card key={item.id} title={`${index + 1}. ${item.description}`} badge={progressConfirmed ? statusLabel(item.status) : '待確認進度'}>
                {initialTracking && <div className="mb-4 grid gap-3 lg:grid-cols-2"><Field label="觀察到的問題 *"><textarea value={item.details.observation} disabled={isSubmitted} onChange={event => { const value = event.target.value; updateInitialDetails({ observation: value }); updateCarry(item.id, 'description', value || '待補充追蹤問題') }} rows={4} placeholder="填寫想要追蹤改善的問題…" className={textareaClass} /></Field><Field label="預計處理方式 *"><textarea value={item.details.solution} disabled={isSubmitted} onChange={event => updateInitialDetails({ solution: event.target.value })} rows={4} placeholder="填寫預計如何處理或改善…" className={textareaClass} /></Field></div>}
                <div className={`mb-4 rounded-xl border p-3 ${progressConfirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  <p className="text-sm font-extrabold">{progressConfirmed ? `本次進度已確認：${item.progress_percent}%` : '請先確認本次會議的改善進度，否則無法送出報告'}</p>
                  <p className="mt-1 text-xs leading-5">0～95% 會列為進行中並自動帶到下次會議；100% 會列為已完成。</p>
                </div>
                <div className="max-w-xl">
                  <Field label={`本次改善進度 *　${item.progress_percent}%`}>
                    <div className="mb-3 grid grid-cols-5 gap-2">{[0, 25, 50, 75, 100].map(value => <button key={value} type="button" disabled={isSubmitted} onClick={() => updateCarryProgress(item, value)} className={`h-10 rounded-lg border text-xs font-extrabold transition disabled:opacity-60 ${item.progress_percent === value ? value === 100 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-orange-400 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-500 hover:border-orange-300'}`}>{value}%</button>)}</div>
                    <input type="range" min={0} max={100} step={5} value={item.progress_percent} disabled={isSubmitted} onChange={event => updateCarryProgress(item, Number(event.target.value))} className="w-full accent-orange-600" />
                  </Field>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="目前處理狀況／本期進度"><textarea value={item.progress_note ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'progress_note', event.target.value)} rows={4} className={textareaClass} /></Field>
                  <Field label="實際遇到的困難"><textarea value={item.difficulty_note ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'difficulty_note', event.target.value)} rows={4} className={textareaClass} /></Field>
                </div>
                <Field label="本次處理結論"><textarea value={item.resolution_note ?? ''} disabled={isSubmitted} onChange={event => { setCarryItems(items => items.map(current => current.id === item.id ? { ...current, resolution_note: event.target.value } : current)); queueItemSave(item.id, 'resolution_note', event.target.value, 650) }} rows={3} className={textareaClass} /></Field>
                <Field label="照片"><SectionPhotoGrid storeId={report.store_id} photos={item.photos} onChange={photos => updateCarry(item.id, 'photos', photos, 0)} maxPhotos={6} disabled={isSubmitted} /></Field>
                {!isSubmitted && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold leading-5 text-amber-800">請務必選擇處理狀態：選擇「進行中」會自動帶到下次會議繼續追蹤；選擇「已完成」則會結案。進度調整到 100% 也會自動切換為已完成。</p><div className="mt-3 flex flex-wrap gap-2"><StatusButton active={item.status === 'open'} onClick={() => updateCarryStatus(item, 'open')}>進行中</StatusButton><StatusButton active={item.status === 'resolved'} tone="green" onClick={() => updateCarryStatus(item, 'resolved')}>已完成</StatusButton></div></div>}
                {!isSubmitted && initialTracking && <div className="mt-3 flex justify-end"><button type="button" onClick={() => removeInitialTracking(item.id)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />刪除追蹤問題</button></div>}
              </Card>
            })}
          </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-5">
            <SectionHeader number="04" title="主動提出問題與解法" description="每筆提案直接填寫提出人、觀察到的問題、預計處理方式及照片。" />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-zinc-900">本次問題提案</h2><p className="text-xs text-zinc-500">已完成 {proposalChecks.filter(check => check.complete).length} / {proposals.length} 項</p></div>
              {!isSubmitted && <button type="button" onClick={addProposal} disabled={addingProposal} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">{addingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}新增問題提案</button>}
            </div>

            {proposals.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">尚未新增問題提案</div> : proposals.map((item, index) => (
              <ProposalCard key={item.id} item={item} index={index} storeId={report.store_id} disabled={isSubmitted} complete={proposalChecks.find(check => check.id === item.id)?.complete ?? false} onChange={(field, value) => updateProposal(item.id, field, value)} onDelete={() => removeProposal(item.id)} />
            ))}
          </div>
        )}

        {activeStep === 5 && (
          <div className="space-y-5">
            <SectionHeader number="05" title="確認送出" description="送出後報告會鎖定；如需修改，可再取消提交。" />
            <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
              <Card title="送出前檢查" icon={<CheckCircle2 className="h-5 w-5" />}>
                <div className="space-y-3">
                  {readiness.map(item => <div key={item.label} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${item.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{item.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</span><span className="text-sm font-semibold text-zinc-700">{item.label}</span></div>)}
                </div>
              </Card>

              <Card title="報告摘要" icon={<FileDown className="h-5 w-5" />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryMetric label="本期營業額" value={comparison ? money(comparison.current.total) : '—'} />
                  <SummaryMetric label="網路評論" value={`${report.google_review_data.new_reviews} 則`} />
                  <SummaryMetric label="客訴" value={`${report.complaint_data.count} 件`} />
                  <SummaryMetric label="問題提案" value={`${proposals.length} 項`} />
                </div>
                <div className="mt-4 rounded-xl border border-zinc-100 p-4"><p className="text-xs font-bold text-zinc-500">營業額分析</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{report.revenue_difference_note || '尚未填寫'}</p></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={exportPdf} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white hover:bg-zinc-800"><FileDown className="h-4 w-4" />匯出 PDF</button>
                  {isSubmitted ? <button type="button" onClick={handleUnsubmit} disabled={pending} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"><Save className="h-4 w-4" />取消提交</button> : <button type="button" onClick={handleSubmit} disabled={pending || !canSubmit} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" />提交報告</button>}
                </div>
              </Card>
            </div>
          </div>
        )}

        <div className="manager-sticky-action-bar sticky -bottom-1 z-20 -mx-4 mt-6 border-t border-zinc-100 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,.05)] backdrop-blur lg:mx-0 lg:rounded-2xl lg:border">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => changeStep(Math.max(1, activeStep - 1))} disabled={activeStep === 1} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 disabled:opacity-30"><ArrowLeft className="h-4 w-4" />上一步</button>
            <span className="hidden text-xs text-zinc-400 sm:inline">第 {activeStep} / 5 步</span>
            {activeStep < 5 ? <button type="button" onClick={() => changeStep(activeStep + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700">下一步：{STEPS[activeStep].label}<ArrowRight className="h-4 w-4" /></button> : <button type="button" onClick={handleSubmit} disabled={pending || isSubmitted || !canSubmit} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />確認送出</button>}
          </div>
        </div>
      </main>
    </div>
  )
}

function RevenueCards({ comparison }: { comparison: MeetingRevenueComparison }) {
  const items = [
    { label: '總營業額', current: comparison.current.total, previous: comparison.previous.total, icon: BarChart3 },
    { label: '現場', current: comparison.current.onsite, previous: comparison.previous.onsite, icon: Store },
    ...(comparison.channels.uber ? [{ label: '優步外送', current: comparison.current.uber, previous: comparison.previous.uber, icon: ArrowRight }] : []),
    ...(comparison.channels.panda ? [{ label: '熊貓外送', current: comparison.current.panda, previous: comparison.previous.panda, icon: ArrowRight }] : []),
    { label: '店內外送', current: comparison.current.storeDelivery, previous: comparison.previous.storeDelivery, icon: ArrowRight },
    { label: '外送合計', current: comparison.current.deliveryTotal, previous: comparison.previous.deliveryTotal, icon: ArrowRight },
    ...(comparison.channels.online ? [{ label: '線上點餐', current: comparison.current.online, previous: comparison.previous.online, icon: ArrowRight }] : []),
  ]
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map(item => {
    const delta = trend(item.current, item.previous)
    const Icon = item.icon
    return <div key={item.label} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-zinc-500">{item.label}</span><Icon className="h-4 w-4 text-orange-500" /></div><div className="mt-3 space-y-1"><p className="text-xs font-bold text-orange-600">本期 <span className="ml-1 text-lg font-extrabold tabular-nums text-zinc-900">{money(item.current)}</span></p><p className="text-xs font-bold text-sky-600">前期 <span className="ml-1 text-sm font-bold tabular-nums text-zinc-600">{money(item.previous)}</span></p></div><div className={`mt-3 border-t border-zinc-100 pt-2 ${delta.positive === null ? 'text-zinc-500' : delta.positive ? 'text-emerald-600' : 'text-rose-600'}`}><p className="text-sm font-extrabold tabular-nums">差異 {signedMoney(item.current - item.previous)}</p><p className="mt-0.5 text-xs font-bold">較前期 {delta.label}</p></div></div>
  })}</div>
}

function DailyRevenueComparison({ comparison }: { comparison: MeetingRevenueComparison }) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <DailyRevenueTable title="本期每日營業額" tone="orange" rows={comparison.current.daily} channels={comparison.channels} />
    <DailyRevenueTable title="前期每日營業額" tone="sky" rows={comparison.previous.daily} channels={comparison.channels} />
  </div>
}

function DailyRevenueTable({ title, tone, rows, channels }: { title: string; tone: 'orange' | 'sky'; rows: DailyRevenueSummary[]; channels: MeetingRevenueComparison['channels'] }) {
  const valueColumns = 4 + Number(channels.uber) + Number(channels.panda) + Number(channels.online)
  return <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
    <div className={`border-b px-4 py-3 ${tone === 'orange' ? 'border-orange-100 bg-orange-50/60' : 'border-sky-100 bg-sky-50/60'}`}><h3 className={`text-sm font-extrabold ${tone === 'orange' ? 'text-orange-700' : 'text-sky-700'}`}>{title}</h3></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-right">總營業額</th><th className="px-3 py-2 text-right">現場</th>{channels.uber && <th className="px-3 py-2 text-right">優步外送</th>}{channels.panda && <th className="px-3 py-2 text-right">熊貓外送</th>}<th className="px-3 py-2 text-right">店內外送</th><th className="px-3 py-2 text-right">外送合計</th>{channels.online && <th className="px-3 py-2 text-right">線上點餐</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-t border-zinc-100"><td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-700">{row.date.replaceAll('-', '/')}</td>{row.hasData ? <><RevenueCell value={row.total} strong /><RevenueCell value={row.onsite} />{channels.uber && <RevenueCell value={row.uber} />}{channels.panda && <RevenueCell value={row.panda} />}<RevenueCell value={row.storeDelivery} /><RevenueCell value={row.deliveryTotal} strong />{channels.online && <RevenueCell value={row.online} />}</> : <td colSpan={valueColumns} className="px-3 py-2 text-center text-zinc-400">當日尚無營業資料</td>}</tr>)}</tbody><tfoot className="border-t-2 border-zinc-200 bg-zinc-50 font-bold text-zinc-800"><tr><td className="px-3 py-2">合計</td><RevenueCell value={rows.reduce((sum, row) => sum + row.total, 0)} strong /><RevenueCell value={rows.reduce((sum, row) => sum + row.onsite, 0)} />{channels.uber && <RevenueCell value={rows.reduce((sum, row) => sum + row.uber, 0)} />}{channels.panda && <RevenueCell value={rows.reduce((sum, row) => sum + row.panda, 0)} />}<RevenueCell value={rows.reduce((sum, row) => sum + row.storeDelivery, 0)} /><RevenueCell value={rows.reduce((sum, row) => sum + row.deliveryTotal, 0)} strong />{channels.online && <RevenueCell value={rows.reduce((sum, row) => sum + row.online, 0)} />}</tr></tfoot></table></div>
  </section>
}

function StoreDeliveryEditor({ title, tone, start, end, entries, disabled, onChange }: {
  title: string
  tone: 'orange' | 'sky'
  start: string
  end: string
  entries: StoreDeliveryEntry[]
  disabled: boolean
  onChange: (date: string, amount: number) => void
}) {
  const amounts = storeDeliveryMap(entries)
  const dates = dateRange(start, end)
  const total = dates.reduce((sum, date) => sum + (amounts.get(date) ?? 0), 0)
  return <section className="overflow-hidden rounded-2xl border border-zinc-200">
    <div className={`flex items-center justify-between px-4 py-3 ${tone === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700'}`}><h3 className="text-sm font-extrabold">{title}</h3><span className="text-sm font-black tabular-nums">合計 {money(total)}</span></div>
    <div className="max-h-[430px] divide-y divide-zinc-100 overflow-y-auto bg-white">{dates.map(date => <label key={date} className="flex items-center justify-between gap-4 px-4 py-2.5"><span className="text-sm font-semibold tabular-nums text-zinc-600">{date.replaceAll('-', '/')}</span><span className="flex items-center gap-2"><span className="text-xs font-bold text-zinc-400">NT$</span><input type="number" min={0} step={1} inputMode="numeric" value={amounts.get(date) ?? ''} disabled={disabled} onChange={event => onChange(date, event.target.value === '' ? 0 : Math.max(0, Number(event.target.value)))} placeholder="0" aria-label={`${date} 店內外送金額`} className="h-9 w-32 rounded-lg border border-zinc-200 px-3 text-right text-sm font-bold tabular-nums outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-zinc-50 disabled:text-zinc-400" /></span></label>)}</div>
  </section>
}

function RevenueCell({ value, strong = false }: { value: number; strong?: boolean }) {
  return <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${strong ? 'font-bold text-zinc-900' : 'text-zinc-600'}`}>{Math.round(value).toLocaleString('zh-TW')}</td>
}

function ProposalCard({ item, index, storeId, disabled, complete, onChange, onDelete }: {
  item: ActionItem
  index: number
  storeId: string
  disabled: boolean
  complete: boolean
  onChange: (field: keyof ActionItem, value: unknown) => void
  onDelete: () => void
}) {
  const details = item.details
  function updateDetails(patch: Partial<ActionItemDetails>) { onChange('details', { ...details, ...patch }) }
  return (
    <Card title={`提案 ${index + 1}`} badge={complete ? '已完成' : '待補充'}>
      <div className="max-w-md"><Field label="提出人 *"><input value={details.proposer_name} disabled={disabled} onChange={event => updateDetails({ proposer_name: event.target.value })} placeholder="輸入提出人的姓名" className={inputClass} /></Field></div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="觀察到的問題 *"><textarea value={details.observation} disabled={disabled} onChange={event => { updateDetails({ observation: event.target.value }); onChange('description', event.target.value || '待補充問題') }} rows={5} placeholder="說明這次觀察到的問題…" className={textareaClass} /></Field>
        <Field label="預計處理方式 *"><textarea value={details.solution} disabled={disabled} onChange={event => updateDetails({ solution: event.target.value })} rows={4} className={textareaClass} /></Field>
      </div>
      <Field label="照片"><SectionPhotoGrid storeId={storeId} photos={item.photos} onChange={photos => onChange('photos', photos)} maxPhotos={6} disabled={disabled} /></Field>
      {!disabled && <div className="mt-3 flex justify-end"><button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />刪除提案</button></div>}
    </Card>
  )
}

function SectionHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-extrabold text-orange-600">{number}</span><div><h2 className="text-xl font-extrabold text-zinc-900">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div></div>
}

function Card({ children, title, icon, badge }: { children: React.ReactNode; title?: string; icon?: React.ReactNode; badge?: string }) {
  return <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm lg:p-5">{title && <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-bold text-zinc-900"><span className="text-orange-500">{icon}</span>{title}</h3>{badge && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge === '已完成' ? 'bg-emerald-50 text-emerald-700' : badge.startsWith('待') ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{badge}</span>}</div>}{children}</section>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mb-3 block text-sm font-semibold text-zinc-700">{label}{hint && <span className="ml-2 text-xs font-normal text-zinc-400">{hint}</span>}<span className="mt-2 block">{children}</span></label>
}

function StatusButton({ active, tone = 'orange', onClick, children }: { active: boolean; tone?: 'orange' | 'green'; onClick: () => void; children: React.ReactNode }) {
  const activeClass = tone === 'green' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-orange-300 bg-orange-50 text-orange-700'
  return <button type="button" onClick={onClick} className={`h-9 rounded-lg border px-3 text-xs font-bold ${active ? activeClass : 'border-zinc-200 bg-white text-zinc-500'}`}>{children}</button>
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[11px] font-semibold text-zinc-500">{label}</p><p className="mt-1 text-sm font-extrabold text-zinc-900">{value}</p></div>
}

function statusLabel(status: ActionItem['status']) {
  if (status === 'resolved') return '已完成'
  if (status === 'dropped') return '已完成'
  return '進行中'
}

const inputClass = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none transition focus:border-orange-400 disabled:bg-zinc-50 disabled:text-zinc-500'
const compactInputClass = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-orange-400 disabled:bg-zinc-100'
const textareaClass = 'w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal leading-6 text-zinc-900 outline-none transition focus:border-orange-400 disabled:bg-zinc-50 disabled:text-zinc-500'
