'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

export interface MeetingReport {
  id: string
  store_id: string
  period_start: string
  period_end: string
  meeting_date: string | null
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

export interface ActionItem {
  id: string
  store_id: string
  raised_in_report_id: string
  description: string
  status: 'open' | 'resolved' | 'dropped'
  resolution_note: string | null
  resolved_in_report_id: string | null
  resolved_at: string | null
  order_index: number
  created_at: string
}

function isoToday(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00+08:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 取得某店家的所有會議報告 */
export async function listMeetingReports(storeId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { data, error } = await admin.from('meeting_reports')
    .select('*').eq('store_id', storeId)
    .order('period_end', { ascending: false })
  if (error) return { error: error.message }
  return { reports: (data ?? []) as MeetingReport[] }
}

/** 取得單一報告 + 行動項目 */
export async function getMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const [{ data: report, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    admin.from('meeting_reports').select('*').eq('id', reportId).single(),
    admin.from('meeting_action_items')
      .select('*')
      .or(`raised_in_report_id.eq.${reportId},and(status.eq.open,resolved_in_report_id.is.null)`)
      .order('order_index'),
  ])
  if (e1) return { error: e1.message }
  if (e2) return { error: e2.message }
  return { report: report as MeetingReport, actionItems: (items ?? []) as ActionItem[] }
}

/** 建立新會議報告（自動帶入上次會議後到今天的區間） */
export async function createMeetingReport(storeId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()

  // 找上次會議的 period_end
  const { data: last } = await admin.from('meeting_reports')
    .select('period_end')
    .eq('store_id', storeId)
    .order('period_end', { ascending: false })
    .limit(1).maybeSingle()

  const today = isoToday()
  const periodStart = last?.period_end ? addDays(last.period_end as string, 1) : addDays(today, -13)

  const { data, error } = await admin.from('meeting_reports').insert({
    store_id: storeId,
    period_start: periodStart,
    period_end: today,
    meeting_date: today,
    status: 'draft',
    created_by: ctx.userId,
  }).select('id').single()
  if (error) return { error: error.message }

  revalidatePath('/manager/meeting-report')
  return { id: data.id as string }
}

/** 更新報告內容（含各區塊文字 + 照片） */
export async function updateMeetingReport(reportId: string, patch: {
  period_start?: string
  period_end?: string
  meeting_date?: string
  operations_review_html?: string
  customer_feedback_html?: string
  customer_feedback_photos?: string[]
  staff_status_html?: string
  staff_status_photos?: string[]
  product_quality_html?: string
  product_quality_photos?: string[]
  notes_html?: string
  notes_photos?: string[]
}) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').update(patch).eq('id', reportId)
  if (error) return { error: error.message }

  revalidatePath('/manager/meeting-report')
  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { ok: true as const }
}

/** 提交報告（draft → submitted） */
export async function submitMeetingReport(reportId: string) {
  return updateStatus(reportId, 'submitted')
}

/** 取消提交（submitted → draft） */
export async function unsubmitMeetingReport(reportId: string) {
  return updateStatus(reportId, 'draft')
}

async function updateStatus(reportId: string, status: 'draft' | 'submitted') {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').update({ status }).eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/manager/meeting-report')
  return { ok: true as const }
}

/** 刪除報告 */
export async function deleteMeetingReport(reportId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_reports').delete().eq('id', reportId)
  if (error) return { error: error.message }
  revalidatePath('/manager/meeting-report')
  return { ok: true as const }
}

// ─── 行動項目 ─────────────────────────────────

/** 新增本次會議提出的改善項目 */
export async function addActionItem(reportId: string, storeId: string, description: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  // 抓最大 order_index 作為新項目
  const { data: maxRow } = await admin.from('meeting_action_items')
    .select('order_index')
    .eq('raised_in_report_id', reportId)
    .order('order_index', { ascending: false }).limit(1).maybeSingle()
  const order_index = (maxRow?.order_index ?? -1) + 1

  const { data, error } = await admin.from('meeting_action_items').insert({
    store_id: storeId,
    raised_in_report_id: reportId,
    description,
    status: 'open',
    order_index,
  }).select('*').single()
  if (error) return { error: error.message }

  revalidatePath(`/manager/meeting-report/${reportId}`)
  return { item: data as ActionItem }
}

/** 更新行動項目描述 */
export async function updateActionItemDescription(itemId: string, description: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_action_items').update({ description }).eq('id', itemId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

/** 標記已解決 / 撤銷 / 改為未解決 */
export async function resolveActionItem(
  itemId: string,
  resolvedInReportId: string,
  note: string,
  status: 'open' | 'resolved' | 'dropped'
) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const patch: any = { status, resolution_note: note }
  if (status === 'resolved' || status === 'dropped') {
    patch.resolved_in_report_id = resolvedInReportId
    patch.resolved_at = isoToday()
  } else {
    patch.resolved_in_report_id = null
    patch.resolved_at = null
  }
  const { error } = await admin.from('meeting_action_items').update(patch).eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath(`/manager/meeting-report/${resolvedInReportId}`)
  return { ok: true as const }
}

/** 刪除行動項目 */
export async function deleteActionItem(itemId: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()
  const { error } = await admin.from('meeting_action_items').delete().eq('id', itemId)
  if (error) return { error: error.message }
  return { ok: true as const }
}

// ─── 自動產生營運回顧 ─────────────────────────────────

/** 系統自動產生「主要營運回顧」HTML — 從資料庫即時計算兩週對比 */
export async function generateOperationsReview(storeId: string, periodStart: string, periodEnd: string) {
  const ctx = await getAuthContext()
  if (!ctx) return { error: '未登入' as const }
  const admin = createAdminClient()

  // 前期 = 同樣天數往前
  const days = Math.round(
    (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000
  ) + 1
  const prevEnd = addDays(periodStart, -1)
  const prevStart = addDays(prevEnd, -(days - 1))

  async function fetchRange(s: string, e: string) {
    const [{ data: closings }, { data: receipts }] = await Promise.all([
      admin.from('daily_closings')
        .select('total_revenue, total_cost, revenue_items(channel, gross_amount)')
        .eq('store_id', storeId).gte('business_date', s).lte('business_date', e)
        .in('status', ['submitted', 'verified']),
      admin.from('receipts')
        .select('total_amount, vendor_name')
        .eq('store_id', storeId).gte('business_date', s).lte('business_date', e),
    ])
    const totalRev = (closings ?? []).reduce((sum: number, c: any) => sum + (c.total_revenue ?? 0), 0)
    const totalCK = (closings ?? []).reduce((sum: number, c: any) => sum + (c.total_cost ?? 0), 0)
    const pos = (closings ?? []).flatMap((c: any) => c.revenue_items ?? []).filter((i: any) => i.channel === 'pos').reduce((s: number, i: any) => s + (i.gross_amount ?? 0), 0)
    const delivery = (closings ?? []).flatMap((c: any) => c.revenue_items ?? []).filter((i: any) => i.channel === 'uber' || i.channel === 'panda').reduce((s: number, i: any) => s + (i.gross_amount ?? 0), 0)
    const totalCost = (receipts ?? []).reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0)
    const days = (closings ?? []).length
    return { totalRev, totalCK, pos, delivery, totalCost, days }
  }

  const [cur, prev] = await Promise.all([
    fetchRange(periodStart, periodEnd),
    fetchRange(prevStart, prevEnd),
  ])

  function pct(c: number, p: number) {
    if (p === 0) return c > 0 ? '+∞%' : '持平'
    const r = Math.round(((c - p) / p) * 100)
    if (r === 0) return '持平'
    return `${r > 0 ? '+' : ''}${r}%`
  }
  function fmt(n: number) { return Math.round(n).toLocaleString('zh-TW') }
  function pctClass(c: number, p: number) {
    if (p === 0) return c > 0 ? 'good' : 'neutral'
    const r = (c - p) / p
    if (r > 0.05) return 'good'
    if (r < -0.05) return 'bad'
    return 'neutral'
  }

  const html = `
<h2>📊 主要營運回顧</h2>
<p><strong>本期：</strong> ${periodStart} ~ ${periodEnd}（${cur.days} 個營業日）<br/>
<strong>前期：</strong> ${prevStart} ~ ${prevEnd}（${prev.days} 個營業日）</p>

<h3>營業額</h3>
<ul>
  <li>本期總營業額：<strong>$${fmt(cur.totalRev)}</strong>　vs 前期 $${fmt(prev.totalRev)}　<em data-trend="${pctClass(cur.totalRev, prev.totalRev)}">${pct(cur.totalRev, prev.totalRev)}</em></li>
  <li>本期 POS：$${fmt(cur.pos)}　vs 前期 $${fmt(prev.pos)}　<em data-trend="${pctClass(cur.pos, prev.pos)}">${pct(cur.pos, prev.pos)}</em></li>
  <li>本期外送：$${fmt(cur.delivery)}　vs 前期 $${fmt(prev.delivery)}　<em data-trend="${pctClass(cur.delivery, prev.delivery)}">${pct(cur.delivery, prev.delivery)}</em></li>
</ul>

<h3>成本</h3>
<ul>
  <li>央廚配送：$${fmt(cur.totalCK)}　vs 前期 $${fmt(prev.totalCK)}　<em data-trend="${pctClass(prev.totalCK, cur.totalCK)}">${pct(cur.totalCK, prev.totalCK)}</em></li>
  <li>食耗成本（收據）：$${fmt(cur.totalCost)}　vs 前期 $${fmt(prev.totalCost)}　<em data-trend="${pctClass(prev.totalCost, cur.totalCost)}">${pct(cur.totalCost, prev.totalCost)}</em></li>
  <li>食耗成本占營業額：<strong>${cur.totalRev > 0 ? ((cur.totalCost / cur.totalRev) * 100).toFixed(1) : '0'}%</strong></li>
</ul>

<h3>估算毛利</h3>
<p>本期估算毛利：<strong>$${fmt(cur.totalRev - cur.totalCK - cur.totalCost)}</strong>（營業額 − 央廚 − 食耗）</p>
`.trim()

  return { html, cur, prev, prevStart, prevEnd }
}
