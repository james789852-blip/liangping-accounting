'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, Camera, Check,
  CheckCircle2, FileDown, Loader2, MessageSquare, Plus,
  RefreshCw, Save, Send, Store, Target, Trash2, UserRound, Users, X,
} from 'lucide-react'
import SectionPhotoGrid from '@/components/manager/section-photo-grid'
import {
  addActionItem,
  deleteActionItem,
  getMeetingRevenueComparison,
  resolveActionItem,
  submitMeetingReport,
  unsubmitMeetingReport,
  updateActionItem,
  updateMeetingReport,
  type ActionItem,
  type ActionItemDetails,
  type MeetingPresenter,
  type MeetingReport,
  type MeetingRevenueComparison,
  type StaffMemberAnalysis,
  type VendorIssue,
} from '@/app/actions/meeting-reports'

interface Props {
  report: MeetingReport
  storeName: string
  thisReportItems: ActionItem[]
  carryOverItems: ActionItem[]
  initialComparison: MeetingRevenueComparison | null
}

const STEPS = [
  { id: 1, label: '營業數據', icon: BarChart3 },
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

function normalizeReport(report: MeetingReport): MeetingReport {
  return {
    ...report,
    revenue_difference_note: report.revenue_difference_note ?? plainText(report.operations_review_html),
    google_review_data: report.google_review_data ?? {
      new_reviews: 0,
      average_rating: null,
      summary: plainText(report.customer_feedback_html),
    },
    complaint_data: report.complaint_data ?? { count: 0, category: '', description: '', resolution: '' },
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

function money(value: number) {
  return `NT$ ${Math.round(value).toLocaleString('zh-TW')}`
}

function trend(current: number, previous: number) {
  if (previous === 0) return { label: current > 0 ? '本期新增' : '—', positive: null as boolean | null }
  const value = ((current - previous) / previous) * 100
  return { label: `${value > 0 ? '+' : ''}${value.toFixed(1)}%`, positive: value >= 0 }
}

export default function EditClient({
  report: initialReport,
  storeName,
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
      const result = await getMeetingRevenueComparison(report.store_id, report.period_start, report.period_end)
      if ('error' in result) return toast.error(result.error)
      setComparison(result)
      toast.success('已更新營業數據')
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
      support_store: '',
      support_needed: '',
    }])
  }

  function updateStaffMember(memberId: string, patch: Partial<StaffMemberAnalysis>) {
    updateReportField('staff_members', report.staff_members.map(member => member.id === memberId ? { ...member, ...patch } : member))
  }

  function removeStaffMember(memberId: string) {
    updateReportField('staff_members', report.staff_members.filter(member => member.id !== memberId))
  }

  function addPresenter() {
    updateReportField('presenters', [...report.presenters, { id: crypto.randomUUID(), name: '', role: '店長' }])
  }

  function updatePresenter(presenterId: string, patch: Partial<MeetingPresenter>) {
    updateReportField('presenters', report.presenters.map(presenter => presenter.id === presenterId ? { ...presenter, ...patch } : presenter))
  }

  async function addProposal() {
    setAddingProposal(true)
    try {
      const firstPresenter = report.presenters.find(presenter => presenter.name.trim())
      const result = await addActionItem(report.id, report.store_id, {
        description: '待補充問題',
        details: {
          proposer_name: firstPresenter?.name ?? '',
          proposer_role: firstPresenter?.role ?? '店長',
        },
      })
      if ('error' in result) return toast.error(result.error)
      setProposals(items => [...items, normalizeItem(result.item)])
    } finally {
      setAddingProposal(false)
    }
  }

  async function removeProposal(itemId: string) {
    if (!confirm('確定刪除這項問題提案？')) return
    const result = await deleteActionItem(itemId)
    if ('error' in result) return toast.error(result.error)
    setProposals(items => items.filter(item => item.id !== itemId))
  }

  async function updateCarryStatus(item: ActionItem, status: ActionItem['status']) {
    const result = await resolveActionItem(item.id, report.id, item.resolution_note ?? '', status)
    if ('error' in result) return toast.error(result.error)
    setCarryItems(items => items.map(current => current.id === item.id
      ? { ...current, status, progress_percent: status === 'resolved' ? 100 : current.progress_percent }
      : current))
  }

  async function exportPdf() {
    const response = await fetch(`/api/meeting-report/${report.id}/pdf`)
    if (!response.ok) return toast.error(`匯出失敗：${await response.text()}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `會議報告_${report.period_start}_${report.period_end}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
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
      && item.details.verification_method.trim()
    ),
  })), [proposals])
  const managers = report.presenters.filter(presenter => presenter.name.trim() && (presenter.role === '店長' || presenter.role === '副店長'))
  const missingManagers = managers.filter(presenter => !proposals.some(item => item.details.proposer_name.trim() === presenter.name.trim()))
  const readiness = [
    { label: '已填寫營業額差異說明', ok: Boolean(report.revenue_difference_note?.trim()) },
    { label: '至少有一項本次問題與解法', ok: proposals.length > 0 },
    { label: '所有問題提案資料完整', ok: proposals.length > 0 && proposalChecks.every(check => check.complete) },
    { label: '店長／副店長皆已提出問題', ok: managers.length > 0 && missingManagers.length === 0 },
  ]
  const canSubmit = readiness.every(item => item.ok)

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
            <SectionHeader number="01" title="營業數據" description="確認本次與前次的兩週區間，再說明營業額變化原因。" />
            <Card>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="本期起始日期"><input type="date" value={report.period_start} disabled={isSubmitted} onChange={event => updateReportField('period_start', event.target.value, 0)} className={inputClass} /></Field>
                <Field label="本期結束日期"><input type="date" value={report.period_end} disabled={isSubmitted} onChange={event => updateReportField('period_end', event.target.value, 0)} className={inputClass} /></Field>
                <Field label="會議日期"><input type="date" value={report.meeting_date ?? ''} disabled={isSubmitted} onChange={event => updateReportField('meeting_date', event.target.value, 0)} className={inputClass} /></Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">
                <span><strong className="text-zinc-900">本期：</strong>{report.period_start.replaceAll('-', '/')} → {report.period_end.replaceAll('-', '/')} {comparison && <>　vs　{comparison.previousStart.replaceAll('-', '/')} → {comparison.previousEnd.replaceAll('-', '/')}</>}</span>
                <button type="button" onClick={refreshRevenue} disabled={refreshingRevenue} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshingRevenue ? 'animate-spin' : ''}`} />重新統計</button>
              </div>
            </Card>

            {comparison ? <RevenueCards comparison={comparison} /> : <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">目前日期區間沒有可顯示的營業資料</div>}

            <Card>
              <Field label="營業額差異說明" hint="請說明上升或下降的主要原因，例如活動、天氣、商圈人流、外送促銷或人力影響。">
                <textarea value={report.revenue_difference_note ?? ''} disabled={isSubmitted} onChange={event => updateReportField('revenue_difference_note', event.target.value)} rows={6} placeholder="例：本期週末內用來客增加，Uber Eats 同步進行優惠活動，因此整體營業額較前期成長…" className={textareaClass} />
              </Field>
            </Card>
          </div>
        )}

        {activeStep === 2 && (
          <div className="space-y-5">
            <SectionHeader number="02" title="營運回顧" description="所有店家使用相同題型；沒有事件時也可填 0 或「無」。" />
            <div className="grid gap-5 xl:grid-cols-2">
              <Card title="Google 評論" icon={<MessageSquare className="h-5 w-5" />}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="本期新增評論"><input type="number" min={0} value={report.google_review_data.new_reviews} disabled={isSubmitted} onChange={event => updateReportField('google_review_data', { ...report.google_review_data, new_reviews: Number(event.target.value) })} className={inputClass} /></Field>
                  <Field label="平均星等"><input type="number" min={0} max={5} step="0.1" value={report.google_review_data.average_rating ?? ''} disabled={isSubmitted} onChange={event => updateReportField('google_review_data', { ...report.google_review_data, average_rating: event.target.value === '' ? null : Number(event.target.value) })} className={inputClass} /></Field>
                </div>
                <Field label="主要回饋"><textarea value={report.google_review_data.summary} disabled={isSubmitted} onChange={event => updateReportField('google_review_data', { ...report.google_review_data, summary: event.target.value })} rows={5} placeholder="整理顧客稱讚與需要改善的重點…" className={textareaClass} /></Field>
              </Card>

              <Card title="客訴紀錄" icon={<AlertCircle className="h-5 w-5" />}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="本期客訴件數"><input type="number" min={0} value={report.complaint_data.count} disabled={isSubmitted} onChange={event => updateReportField('complaint_data', { ...report.complaint_data, count: Number(event.target.value) })} className={inputClass} /></Field>
                  <Field label="主要類型"><input value={report.complaint_data.category} disabled={isSubmitted} onChange={event => updateReportField('complaint_data', { ...report.complaint_data, category: event.target.value })} placeholder="餐點／服務／外送" className={inputClass} /></Field>
                </div>
                <Field label="問題說明"><textarea value={report.complaint_data.description} disabled={isSubmitted} onChange={event => updateReportField('complaint_data', { ...report.complaint_data, description: event.target.value })} rows={3} className={textareaClass} /></Field>
                <Field label="處理結果"><textarea value={report.complaint_data.resolution} disabled={isSubmitted} onChange={event => updateReportField('complaint_data', { ...report.complaint_data, resolution: event.target.value })} rows={3} className={textareaClass} /></Field>
              </Card>
            </div>

            <Card title="顧客回饋與客訴附件" icon={<Camera className="h-5 w-5" />}>
              <SectionPhotoGrid storeId={report.store_id} photos={report.customer_feedback_photos} onChange={photos => updateReportField('customer_feedback_photos', photos, 0)} disabled={isSubmitted} />
            </Card>

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

            <Card title="店內整體人力狀況" icon={<Users className="h-5 w-5" />}>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="人力狀況"><select value={report.staff_overview.staffing_status} disabled={isSubmitted} onChange={event => updateReportField('staff_overview', { ...report.staff_overview, staffing_status: event.target.value })} className={inputClass}><option>正常</option><option>人力吃緊</option><option>缺額招募中</option><option>新人訓練中</option><option>需要各店支援</option></select></Field>
                <Field label="訓練需求"><input value={report.staff_overview.training_needs} disabled={isSubmitted} onChange={event => updateReportField('staff_overview', { ...report.staff_overview, training_needs: event.target.value })} placeholder="例：外場服務話術" className={inputClass} /></Field>
              </div>
              <Field label="其他說明"><textarea value={report.staff_overview.note} disabled={isSubmitted} onChange={event => updateReportField('staff_overview', { ...report.staff_overview, note: event.target.value })} rows={5} className={textareaClass} /></Field>
              <div className="mt-4"><SectionPhotoGrid storeId={report.store_id} photos={report.staff_status_photos} onChange={photos => updateReportField('staff_status_photos', photos, 0)} disabled={isSubmitted} /></div>
            </Card>

            <Card title="個別同仁分析回報" icon={<UserRound className="h-5 w-5" />}>
              <p className="mb-4 text-xs leading-5 text-zinc-500">可針對每位同仁記錄表現亮點、需要改善的地方、後續安排，以及是否需要其他店家協助。</p>
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
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="同仁姓名"><input value={member.name} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { name: event.target.value })} placeholder="姓名" className={inputClass} /></Field>
                      <Field label="職務／工作站"><input value={member.role} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { role: event.target.value })} placeholder="例：外場、廚房、儲備幹部" className={inputClass} /></Field>
                      <Field label="目前狀況"><select value={member.current_status} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { current_status: event.target.value as StaffMemberAnalysis['current_status'] })} className={inputClass}><option>表現良好</option><option>穩定</option><option>培訓中</option><option>需要關注</option></select></Field>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <Field label="表現亮點"><textarea value={member.strengths} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { strengths: event.target.value })} rows={4} placeholder="近期做得好的地方…" className={textareaClass} /></Field>
                      <Field label="需要改善／觀察"><textarea value={member.concerns} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { concerns: event.target.value })} rows={4} placeholder="目前問題或需要持續觀察的狀況…" className={textareaClass} /></Field>
                      <Field label="預計處理方式"><textarea value={member.action_plan} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { action_plan: event.target.value })} rows={4} placeholder="訓練、面談、排班或追蹤安排…" className={textareaClass} /></Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="需要支援的店家"><input value={member.support_store} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { support_store: event.target.value })} placeholder="例：中壢店；不需要可留空" className={inputClass} /></Field>
                      <Field label="需要各店支援的內容"><input value={member.support_needed} disabled={isSubmitted} onChange={event => updateStaffMember(member.id, { support_needed: event.target.value })} placeholder="例：支援新人訓練、借調尖峰人力" className={inputClass} /></Field>
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
            <SectionHeader number="03" title="上次改善追蹤" description="每項問題都要留下目前狀況、改善進度、困難與需要的協助。" />
            {carryItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" /><p className="mt-3 font-bold text-zinc-700">目前沒有上次結轉的待改善事項</p></div>
            ) : carryItems.map((item, index) => (
              <Card key={item.id} title={`${index + 1}. ${item.description}`} badge={statusLabel(item.status)}>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="負責人"><input value={item.owner_name ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'owner_name', event.target.value)} className={inputClass} /></Field>
                  <Field label="目標完成日"><input type="date" value={item.due_date ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'due_date', event.target.value || null)} className={inputClass} /></Field>
                  <Field label={`改善進度 ${item.progress_percent}%`}><input type="range" min={0} max={100} step={5} value={item.progress_percent} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'progress_percent', Number(event.target.value))} className="mt-3 w-full accent-orange-600" /></Field>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <Field label="目前處理狀況／本期進度"><textarea value={item.progress_note ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'progress_note', event.target.value)} rows={4} className={textareaClass} /></Field>
                  <Field label="實際遇到的困難"><textarea value={item.difficulty_note ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'difficulty_note', event.target.value)} rows={4} className={textareaClass} /></Field>
                  <Field label="需要各店支援"><textarea value={item.store_support_note ?? ''} disabled={isSubmitted} onChange={event => updateCarry(item.id, 'store_support_note', event.target.value)} rows={4} placeholder="請說明需要哪間店提供何種支援…" className={textareaClass} /></Field>
                </div>
                <Field label="本次處理結論"><textarea value={item.resolution_note ?? ''} disabled={isSubmitted} onChange={event => { setCarryItems(items => items.map(current => current.id === item.id ? { ...current, resolution_note: event.target.value } : current)); queueItemSave(item.id, 'resolution_note', event.target.value, 650) }} rows={3} className={textareaClass} /></Field>
                {!isSubmitted && <div className="mt-3 flex flex-wrap gap-2"><StatusButton active={item.status === 'open'} onClick={() => updateCarryStatus(item, 'open')}>進行中</StatusButton><StatusButton active={item.status === 'resolved'} tone="green" onClick={() => updateCarryStatus(item, 'resolved')}>已完成</StatusButton><StatusButton active={item.status === 'dropped'} tone="gray" onClick={() => updateCarryStatus(item, 'dropped')}>不再處理</StatusButton></div>}
              </Card>
            ))}
          </div>
        )}

        {activeStep === 4 && (
          <div className="space-y-5">
            <SectionHeader number="04" title="主動提出問題與解法" description="列入本次會議的每位店長或副店長，至少要提出一項觀察與預計處理方式。" />
            <Card title="本次報告人員" icon={<UserRound className="h-5 w-5" />}>
              <div className="space-y-2">
                {report.presenters.map((presenter, index) => (
                  <div key={presenter.id} className="grid gap-2 rounded-xl bg-zinc-50 p-3 md:grid-cols-[32px_1fr_160px_40px] md:items-center">
                    <span className="text-center text-xs font-bold text-zinc-400">{index + 1}</span>
                    <input value={presenter.name} disabled={isSubmitted} onChange={event => updatePresenter(presenter.id, { name: event.target.value })} placeholder="姓名" className={compactInputClass} />
                    <select value={presenter.role} disabled={isSubmitted} onChange={event => updatePresenter(presenter.id, { role: event.target.value as MeetingPresenter['role'] })} className={compactInputClass}><option>店長</option><option>副店長</option><option>其他</option></select>
                    {!isSubmitted && <button type="button" onClick={() => updateReportField('presenters', report.presenters.filter(item => item.id !== presenter.id))} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                {report.presenters.length === 0 && <p className="rounded-xl border border-dashed border-zinc-200 py-7 text-center text-sm text-zinc-400">請先加入本次報告的店長或副店長</p>}
              </div>
              {!isSubmitted && <button type="button" onClick={addPresenter} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-orange-300 px-4 text-sm font-bold text-orange-600 hover:bg-orange-50"><Plus className="h-4 w-4" />加入報告人員</button>}
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-zinc-900">本次問題提案</h2><p className="text-xs text-zinc-500">已完成 {proposalChecks.filter(check => check.complete).length} / {proposals.length} 項</p></div>
              {!isSubmitted && <button type="button" onClick={addProposal} disabled={addingProposal} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">{addingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}新增問題提案</button>}
            </div>

            {proposals.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">尚未新增問題提案</div> : proposals.map((item, index) => (
              <ProposalCard key={item.id} item={item} index={index} presenters={report.presenters} disabled={isSubmitted} complete={proposalChecks.find(check => check.id === item.id)?.complete ?? false} onChange={(field, value) => updateProposal(item.id, field, value)} onDelete={() => removeProposal(item.id)} />
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
                {missingManagers.length > 0 && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">尚未提出問題：{missingManagers.map(person => person.name).join('、')}</p>}
              </Card>

              <Card title="報告摘要" icon={<FileDown className="h-5 w-5" />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryMetric label="本期營業額" value={comparison ? money(comparison.current.total) : '—'} />
                  <SummaryMetric label="Google 評論" value={`${report.google_review_data.new_reviews} 則`} />
                  <SummaryMetric label="客訴" value={`${report.complaint_data.count} 件`} />
                  <SummaryMetric label="問題提案" value={`${proposals.length} 項`} />
                </div>
                <div className="mt-4 rounded-xl border border-zinc-100 p-4"><p className="text-xs font-bold text-zinc-500">營業額差異說明</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{report.revenue_difference_note || '尚未填寫'}</p></div>
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
    { label: 'Uber Eats', current: comparison.current.uber, previous: comparison.previous.uber, icon: ArrowRight },
    { label: 'foodpanda', current: comparison.current.panda, previous: comparison.previous.panda, icon: ArrowRight },
    { label: '線上點餐', current: comparison.current.online, previous: comparison.previous.online, icon: ArrowRight },
  ]
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{items.map(item => {
    const delta = trend(item.current, item.previous)
    const Icon = item.icon
    return <div key={item.label} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-zinc-500">{item.label}</span><Icon className="h-4 w-4 text-orange-500" /></div><p className="mt-3 text-xl font-extrabold tabular-nums text-zinc-900">{money(item.current)}</p><p className={`mt-1 text-sm font-bold ${delta.positive === null ? 'text-zinc-400' : delta.positive ? 'text-emerald-600' : 'text-rose-600'}`}>{delta.label}<span className="ml-1 text-xs font-normal text-zinc-400">較前期</span></p></div>
  })}</div>
}

function ProposalCard({ item, index, presenters, disabled, complete, onChange, onDelete }: {
  item: ActionItem
  index: number
  presenters: MeetingPresenter[]
  disabled: boolean
  complete: boolean
  onChange: (field: keyof ActionItem, value: unknown) => void
  onDelete: () => void
}) {
  const details = item.details
  function updateDetails(patch: Partial<ActionItemDetails>) { onChange('details', { ...details, ...patch }) }
  return (
    <Card title={`提案 ${index + 1}`} badge={complete ? '已完成' : '待補充'}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="提出人 *"><select value={details.proposer_name} disabled={disabled} onChange={event => { const presenter = presenters.find(person => person.name === event.target.value); updateDetails({ proposer_name: event.target.value, proposer_role: presenter?.role ?? details.proposer_role }) }} className={inputClass}><option value="">請選擇</option>{presenters.filter(p => p.name.trim()).map(p => <option key={p.id} value={p.name}>{p.name}｜{p.role}</option>)}</select></Field>
        <Field label="負責人"><input value={item.owner_name ?? ''} disabled={disabled} onChange={event => onChange('owner_name', event.target.value)} className={inputClass} /></Field>
        <Field label="預計完成日"><input type="date" value={item.due_date ?? ''} disabled={disabled} onChange={event => onChange('due_date', event.target.value || null)} className={inputClass} /></Field>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="觀察到的問題 *"><textarea value={details.observation} disabled={disabled} onChange={event => { updateDetails({ observation: event.target.value }); onChange('description', event.target.value || '待補充問題') }} rows={4} className={textareaClass} /></Field>
        <Field label="影響範圍"><textarea value={details.impact} disabled={disabled} onChange={event => updateDetails({ impact: event.target.value })} rows={4} placeholder="對顧客、同仁、營業額或成本的影響…" className={textareaClass} /></Field>
        <Field label="原因判斷"><textarea value={details.cause} disabled={disabled} onChange={event => updateDetails({ cause: event.target.value })} rows={4} className={textareaClass} /></Field>
        <Field label="預計處理方式 *"><textarea value={details.solution} disabled={disabled} onChange={event => updateDetails({ solution: event.target.value })} rows={4} className={textareaClass} /></Field>
      </div>
      <Field label="如何確認改善有效 *"><textarea value={details.verification_method} disabled={disabled} onChange={event => updateDetails({ verification_method: event.target.value })} rows={3} placeholder="例：兩週後比較備餐時間，目標平均縮短 20%…" className={`${textareaClass} ${!details.verification_method.trim() ? 'border-rose-200 bg-rose-50/30' : ''}`} /></Field>
      {!disabled && <div className="mt-3 flex justify-end"><button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />刪除提案</button></div>}
    </Card>
  )
}

function SectionHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex items-start gap-3"><span className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-extrabold text-orange-600">{number}</span><div><h2 className="text-xl font-extrabold text-zinc-900">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div></div>
}

function Card({ children, title, icon, badge }: { children: React.ReactNode; title?: string; icon?: React.ReactNode; badge?: string }) {
  return <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm lg:p-5">{title && <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-base font-bold text-zinc-900"><span className="text-orange-500">{icon}</span>{title}</h3>{badge && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge === '已完成' ? 'bg-emerald-50 text-emerald-700' : badge === '待補充' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{badge}</span>}</div>}{children}</section>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mb-3 block text-sm font-semibold text-zinc-700">{label}{hint && <span className="ml-2 text-xs font-normal text-zinc-400">{hint}</span>}<span className="mt-2 block">{children}</span></label>
}

function StatusButton({ active, tone = 'orange', onClick, children }: { active: boolean; tone?: 'orange' | 'green' | 'gray'; onClick: () => void; children: React.ReactNode }) {
  const activeClass = tone === 'green' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : tone === 'gray' ? 'border-zinc-300 bg-zinc-100 text-zinc-700' : 'border-orange-300 bg-orange-50 text-orange-700'
  return <button type="button" onClick={onClick} className={`h-9 rounded-lg border px-3 text-xs font-bold ${active ? activeClass : 'border-zinc-200 bg-white text-zinc-500'}`}>{children}</button>
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[11px] font-semibold text-zinc-500">{label}</p><p className="mt-1 text-sm font-extrabold text-zinc-900">{value}</p></div>
}

function statusLabel(status: ActionItem['status']) {
  if (status === 'resolved') return '已完成'
  if (status === 'dropped') return '不再處理'
  return '進行中'
}

const inputClass = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 outline-none transition focus:border-orange-400 disabled:bg-zinc-50 disabled:text-zinc-500'
const compactInputClass = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-orange-400 disabled:bg-zinc-100'
const textareaClass = 'w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-normal leading-6 text-zinc-900 outline-none transition focus:border-orange-400 disabled:bg-zinc-50 disabled:text-zinc-500'
