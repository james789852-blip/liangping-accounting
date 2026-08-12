'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessStore, getAuthContext, type AuthContext } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

export interface GoogleReviewData {
  new_reviews: number
  average_rating: number | null
  summary: string
}

export interface ComplaintData {
  count: number
  category: string
  description: string
  resolution: string
}

export interface VendorIssue {
  id: string
  vendor: string
  item: string
  issue: string
  status: string
}

export interface StaffOverview {
  staffing_status: string
  training_needs: string
  note: string
}

export interface StaffMemberAnalysis {
  id: string
  name: string
  role: string
  current_status: '表現良好' | '穩定' | '培訓中' | '需要關注'
  strengths: string
  concerns: string
  action_plan: string
  support_store: string
  support_needed: string
}

export interface MeetingPresenter {
  id: string
  name: string
  role: '店長' | '副店長' | '其他'
}

export interface MeetingReport {
  id: string
  store_id: string
  period_start: string
  period_end: string
  meeting_date: string | null
  revenue_difference_note: string | null
  google_review_data: GoogleReviewData
  complaint_data: ComplaintData
  vendor_issues: VendorIssue[]
  staff_overview: StaffOverview
  staff_members: StaffMemberAnalysis[]
  presenters: MeetingPresenter[]
  current_step: number
  operations_review_html: string | null
  customer_feedback_html: string | null
  customer_feedback_photos: string[]
  staff_status_html: string | null
  staff_status_photos: string[]
  product_quality_html: string | null
  product_quality_photos: string[]
  notes_html: string | null
  notes_photos: string[]
  status: 'draft' | 'submitted'
  created_at: string
  updated_at: string
}

export interface ActionItemDetails {
  proposer_name: string
  proposer_role: '店長' | '副店長' | '其他'
  observation: string
  impact: string
  cause: string
  solution: string
  verification_method: string
}

export interface ActionItem {
  id: string
  store_id: string
  raised_in_report_id: string
  description: string
  details: ActionItemDetails
  owner_name: string | null
  due_date: string | null
  progress_percent: number
  progress_note: string | null
  difficulty_note: string | null
  hq_support_note: string | null
  store_support_note: string | null
  photos: string[]
  status: 'open' | 'resolved' | 'dropped'
  resolution_note: string | null
  resolved_in_report_id: string | null
  resolved_at: string | null
  order_index: number
  created_at: string
}

export interface RevenuePeriodSummary {
  total: number
  onsite: number
  uber: number
  panda: number
  online: number
  operatingDays: number
}

export interface MeetingRevenueComparison {
  current: RevenuePeriodSummary
  previous: RevenuePeriodSummary
  previousStart: string
  previousEnd: string
}

interface ClosingRevenueRow {
  business_date: string
  status: string
  updated_at: string
  total_revenue: number | null
  revenue_items: Array<{ channel: string; gross_amount: number | null }>
}

type MeetingReportPatch = Partial<Pick<MeetingReport,
  | 'period_start'
  | 'period_end'
  | 'meeting_date'
  | 'revenue_difference_note'
  | 'google_review_data'
  | 'complaint_data'
  | 'vendor_issues'
  | 'staff_overview'
  | 'staff_members'
  | 'presenters'
  | 'current_step'
  | 'operations_review_html'
  | 'customer_feedback_html'
  | 'customer_feedback_photos'
  | 'staff_status_html'
  | 'staff_status_photos'
  | 'product_quality_html'
  | 'product_quality_photos'
  | 'notes_html'
  | 'notes_photos'
>>

type ActionItemPatch = Partial<Pick<ActionItem,
  | 'description'
  | 'details'
  | 'owner_name'
  | 'due_date'
  | 'progress_percent'
  | 'progress_note'
  | 'difficulty_note'
  | 'hq_support_note'
  | 'store_support_note'
  | 'photos'
  | 'resolution_note'
>>

function isoToday(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00+08:00`).getTime())
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00+08:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function getAuthorizedReport(
  reportId: string,
  ctx: AuthContext,
): Promise<{ report: MeetingReport } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('meeting_reports').select('*').eq('id', reportId).single()
  if (error || !data) return { error: '找不到會議報告' as const }
  if (!canAccessStore(ctx, data.store_id as string)) return { error: '無權限' as const }
  return { report: data as MeetingReport }
}

async function getAuthorizedItem(
  itemId: string,
  ctx: AuthContext,
): Promise<{ item: ActionItem } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('meeting_action_items').select('*').eq('id', itemId).single()
  if (error || !data) return { error: '找不到改善事項' as const }
  if (!canAccessStore(ctx, data.store_id as string)) return { error: '無權限' as const }
  return { item: data as ActionItem }
}

/** 取得某店家的所有會議報告。 */
export async function listMeetingReports(storeId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限' as const }
  const admin = createAdminClient()
  const { data, error } = await admin.from('meeting_reports')
    .select('*').eq('store_id', storeId)
    .order('period_end', { ascending: false })
  if (error) return { error: error.message }
  return { reports: (data ?? []) as MeetingReport[] }
}

/** 取得單一報告與該店的本次、結轉改善事項。 */
export async function getMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized

  const admin = createAdminClient()
  const { report } = authorized
  const { data: items, error } = await admin.from('meeting_action_items')
    .select('*')
    .eq('store_id', report.store_id)
    .or(`raised_in_report_id.eq.${reportId},resolved_in_report_id.eq.${reportId},and(status.eq.open,resolved_in_report_id.is.null)`)
    .order('order_index')
  if (error) return { error: error.message }
  return { report, actionItems: (items ?? []) as ActionItem[] }
}

/**
 * 建立新會議報告。比較區間預設為會議日前一天往回 14 天，
 * 並可在報告第一步再調整。
 */
export async function createMeetingReport(storeId: string, requestedMeetingDate?: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限' as const }

  const meetingDate = requestedMeetingDate && isIsoDate(requestedMeetingDate)
    ? requestedMeetingDate
    : isoToday()
  const periodEnd = addDays(meetingDate, -1)
  const periodStart = addDays(periodEnd, -13)

  const admin = createAdminClient()
  const { data, error } = await admin.from('meeting_reports').insert({
    store_id: storeId,
    period_start: periodStart,
    period_end: periodEnd,
    meeting_date: meetingDate,
    status: 'draft',
    current_step: 1,
    created_by: ctx.userId,
  }).select('id').single()
  if (error) return { error: error.message }

  revalidatePath('/manager/meeting-report')
  return { id: data.id as string }
}

/** 更新報告內容（每次只允許更新明確列出的欄位）。 */
export async function updateMeetingReport(reportId: string, patch: MeetingReportPatch) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized

  if (patch.current_step !== undefined && (patch.current_step < 1 || patch.current_step > 5)) {
    return { error: '步驟不正確' as const }
  }
  if (patch.period_start && !isIsoDate(patch.period_start)) return { error: '起始日期格式不正確' as const }
  if (patch.period_end && !isIsoDate(patch.period_end)) return { error: '結束日期格式不正確' as const }
  if (patch.meeting_date && !isIsoDate(patch.meeting_date)) return { error: '會議日期格式不正確' as const }

  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').update(patch).eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/manager/meeting-report')
  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { ok: true as const }
}

/** 提交前檢查最基本的統一格式與主動提案要求。 */
export async function submitMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized

  const admin = createAdminClient()
  const { report } = authorized
  const { data: items, error } = await admin.from('meeting_action_items')
    .select('*').eq('raised_in_report_id', reportId).order('order_index')
  if (error) return { error: error.message }
  const proposals = (items ?? []) as ActionItem[]

  if (!(report.revenue_difference_note ?? '').trim() && !(report.operations_review_html ?? '').trim()) {
    return { error: '請先填寫營業額差異說明' as const }
  }
  if (proposals.length === 0) return { error: '請至少新增一項本次問題與解法' as const }

  for (const item of proposals) {
    const details = item.details ?? ({} as ActionItemDetails)
    if (!details.proposer_name?.trim() || !details.observation?.trim() || !details.solution?.trim() || !details.verification_method?.trim()) {
      return { error: '每項提案都要填寫提出人、觀察問題、處理方式及成效確認方式' as const }
    }
  }

  const presenters = (report.presenters ?? []).filter(p => p.name?.trim() && (p.role === '店長' || p.role === '副店長'))
  if (presenters.length === 0) return { error: '請至少加入一位店長或副店長作為本次報告人員' as const }
  const missingPresenter = presenters.find(p => !proposals.some(item => item.details?.proposer_name?.trim() === p.name.trim()))
  if (missingPresenter) return { error: `${missingPresenter.name} 尚未提出本次問題與解法` as const }

  const { error: updateError } = await admin.from('meeting_reports')
    .update({ status: 'submitted', current_step: 5 }).eq('id', reportId)
  if (updateError) return { error: updateError.message }
  revalidatePath('/manager/meeting-report')
  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { ok: true as const }
}

export async function unsubmitMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').update({ status: 'draft' }).eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/manager/meeting-report')
  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { ok: true as const }
}

export async function deleteMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').delete().eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/manager/meeting-report')
  return { ok: true as const }
}

// ─── 改善事項與主動提案 ───────────────────────────────

export async function addActionItem(
  reportId: string,
  storeId: string,
  input: string | { description: string; details?: Partial<ActionItemDetails> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedReport(reportId, ctx)
  if ('error' in authorized) return authorized
  if (authorized.report.store_id !== storeId) return { error: '店家資料不一致' as const }

  const admin = createAdminClient()
  const { data: maxRow } = await admin.from('meeting_action_items')
    .select('order_index').eq('raised_in_report_id', reportId)
    .order('order_index', { ascending: false }).limit(1).maybeSingle()
  const orderIndex = (maxRow?.order_index ?? -1) + 1
  const description = typeof input === 'string' ? input : input.description
  const details = typeof input === 'string' ? undefined : input.details

  const { data, error } = await admin.from('meeting_action_items').insert({
    store_id: storeId,
    raised_in_report_id: reportId,
    description: description.trim() || '待補充問題',
    details: {
      proposer_name: details?.proposer_name ?? '',
      proposer_role: details?.proposer_role ?? '店長',
      observation: details?.observation ?? '',
      impact: details?.impact ?? '',
      cause: details?.cause ?? '',
      solution: details?.solution ?? '',
      verification_method: details?.verification_method ?? '',
    },
    status: 'open',
    order_index: orderIndex,
  }).select('*').single()
  if (error) return { error: error.message }
  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { item: data as ActionItem }
}

export async function updateActionItem(itemId: string, patch: ActionItemPatch) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedItem(itemId, ctx)
  if ('error' in authorized) return authorized
  if (patch.progress_percent !== undefined && (patch.progress_percent < 0 || patch.progress_percent > 100)) {
    return { error: '改善進度必須介於 0 到 100' as const }
  }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_action_items').update(patch).eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath(`/manager/meeting-report/${authorized.item.raised_in_report_id}`)
  return { ok: true as const }
}

export async function updateActionItemDescription(itemId: string, description: string) {
  return updateActionItem(itemId, { description })
}

export async function resolveActionItem(
  itemId: string,
  resolvedInReportId: string,
  note: string,
  status: 'open' | 'resolved' | 'dropped',
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const [itemAuthorized, reportAuthorized] = await Promise.all([
    getAuthorizedItem(itemId, ctx),
    getAuthorizedReport(resolvedInReportId, ctx),
  ])
  if ('error' in itemAuthorized) return itemAuthorized
  if ('error' in reportAuthorized) return reportAuthorized
  if (itemAuthorized.item.store_id !== reportAuthorized.report.store_id) return { error: '店家資料不一致' as const }

  const patch: Record<string, unknown> = { status, resolution_note: note }
  if (status === 'resolved' || status === 'dropped') {
    patch.resolved_in_report_id = resolvedInReportId
    patch.resolved_at = isoToday()
    if (status === 'resolved') patch.progress_percent = 100
  } else {
    patch.resolved_in_report_id = null
    patch.resolved_at = null
  }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_action_items').update(patch).eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath(`/manager/meeting-report/${resolvedInReportId}`)
  return { ok: true as const }
}

export async function deleteActionItem(itemId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const authorized = await getAuthorizedItem(itemId, ctx)
  if ('error' in authorized) return authorized
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_action_items').delete().eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath(`/manager/meeting-report/${authorized.item.raised_in_report_id}`)
  return { ok: true as const }
}

// ─── 營業額雙週比較 ─────────────────────────────────

export async function getMeetingRevenueComparison(
  storeId: string,
  periodStart: string,
  periodEnd: string,
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  if (!canAccessStore(ctx, storeId)) return { error: '無權限' as const }
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) {
    return { error: '比較日期不正確' as const }
  }

  const days = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1
  const previousEnd = addDays(periodStart, -1)
  const previousStart = addDays(previousEnd, -(days - 1))
  const admin = createAdminClient()
  const { data: store } = await admin.from('stores').select('ichef_uber_linked').eq('id', storeId).single()
  const ichefUberLinked = Boolean(store?.ichef_uber_linked)

  async function fetchRange(start: string, end: string): Promise<RevenuePeriodSummary> {
    const { data, error } = await admin.from('daily_closings')
      .select('business_date, status, updated_at, total_revenue, revenue_items(channel, gross_amount)')
      .eq('store_id', storeId).gte('business_date', start).lte('business_date', end)
      .order('updated_at', { ascending: true })
    if (error) throw new Error(error.message)

    const priority: Record<string, number> = { verified: 4, submitted: 3, disputed: 2, draft: 1 }
    const byDate = new Map<string, ClosingRevenueRow>()
    for (const row of (data ?? []) as ClosingRevenueRow[]) {
      const current = byDate.get(row.business_date)
      if (!current || (priority[row.status] ?? 0) >= (priority[current.status] ?? 0)) byDate.set(row.business_date, row)
    }

    const result: RevenuePeriodSummary = { total: 0, onsite: 0, uber: 0, panda: 0, online: 0, operatingDays: 0 }
    for (const row of byDate.values()) {
      let pos = 0
      let twpay = 0
      let handwrite = 0
      let uber = 0
      let panda = 0
      let online = 0
      for (const item of row.revenue_items ?? []) {
        const amount = Number(item.gross_amount ?? 0)
        if (item.channel === 'pos') pos += amount
        else if (item.channel === 'twpay') twpay += amount
        else if (item.channel === 'handwrite') handwrite += amount
        else if (item.channel === 'uber') uber += amount
        else if (item.channel === 'panda') panda += amount
        else if (item.channel === 'online' || item.channel === 'online_cash') online += amount
      }
      const reportedTotal = Number(row.total_revenue ?? 0)
      const rawOnsite = pos + twpay + handwrite
      const onsite = ichefUberLinked
        ? Math.max(0, reportedTotal - uber - panda - online)
        : rawOnsite
      const channelTotal = onsite + uber + panda + online
      const total = ichefUberLinked
        ? (reportedTotal || channelTotal)
        : Math.max(reportedTotal, channelTotal)

      result.total += total
      result.onsite += onsite
      result.uber += uber
      result.panda += panda
      result.online += online
      result.operatingDays += 1
    }
    return result
  }

  try {
    const [current, previous] = await Promise.all([
      fetchRange(periodStart, periodEnd),
      fetchRange(previousStart, previousEnd),
    ])
    return { current, previous, previousStart, previousEnd } satisfies MeetingRevenueComparison
  } catch (error) {
    return { error: error instanceof Error ? error.message : '營業額讀取失敗' }
  }
}

/** 舊版 PDF/報告相容：產出一段可編輯的營運回顧 HTML。 */
export async function generateOperationsReview(storeId: string, periodStart: string, periodEnd: string) {
  const result = await getMeetingRevenueComparison(storeId, periodStart, periodEnd)
  if ('error' in result) return result

  const fmt = (value: number) => Math.round(value).toLocaleString('zh-TW')
  const pct = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+∞%' : '持平'
    const value = Math.round(((current - previous) / previous) * 100)
    return value === 0 ? '持平' : `${value > 0 ? '+' : ''}${value}%`
  }
  const { current, previous, previousStart, previousEnd } = result
  const html = `
<h2>主要營運回顧</h2>
<p><strong>本期：</strong>${periodStart} ~ ${periodEnd}<br/><strong>前期：</strong>${previousStart} ~ ${previousEnd}</p>
<ul>
  <li>總營業額：<strong>$${fmt(current.total)}</strong>，前期 $${fmt(previous.total)}（${pct(current.total, previous.total)}）</li>
  <li>現場：$${fmt(current.onsite)}，前期 $${fmt(previous.onsite)}（${pct(current.onsite, previous.onsite)}）</li>
  <li>Uber Eats：$${fmt(current.uber)}，前期 $${fmt(previous.uber)}（${pct(current.uber, previous.uber)}）</li>
  <li>foodpanda：$${fmt(current.panda)}，前期 $${fmt(previous.panda)}（${pct(current.panda, previous.panda)}）</li>
  <li>線上點餐：$${fmt(current.online)}，前期 $${fmt(previous.online)}（${pct(current.online, previous.online)}）</li>
</ul>`.trim()
  return { html, cur: current, prev: previous, prevStart: previousStart, prevEnd: previousEnd }
}
