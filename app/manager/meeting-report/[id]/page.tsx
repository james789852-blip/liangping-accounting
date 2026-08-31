import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/authed-user'
import { getMeetingReport, getMeetingRevenueComparison } from '@/app/actions/meeting-reports'
import EditClient from './edit-client'

export const dynamic = 'force-dynamic'

export default async function ManagerMeetingReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { id } = await params
  const result = await getMeetingReport(id)
  if ('error' in result) notFound()

  const { report, actionItems } = result
  const admin = createAdminClient()
  const [storeResult, comparisonResult, earlierSubmittedReportsResult] = await Promise.all([
    admin.from('stores').select('name').eq('id', report.store_id).single(),
    getMeetingRevenueComparison(
      report.store_id,
      report.period_start,
      report.period_end,
      report.comparison_period_start,
      report.comparison_period_end,
      report.store_delivery_data,
    ),
    admin.from('meeting_reports')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', report.store_id)
      .eq('status', 'submitted')
      .lt('created_at', report.created_at),
  ])
  const isInitialTracking = (item: (typeof actionItems)[number]) => Boolean(item.details?.is_initial_tracking)

  return (
    <EditClient
      report={report}
      storeName={(storeResult.data?.name as string | null) ?? '我的店'}
      isFirstReport={!earlierSubmittedReportsResult.error && (earlierSubmittedReportsResult.count ?? 0) === 0}
      thisReportItems={actionItems.filter(item => item.raised_in_report_id === report.id && !isInitialTracking(item))}
      carryOverItems={actionItems.filter(item => item.raised_in_report_id !== report.id || isInitialTracking(item))}
      initialComparison={'error' in comparisonResult ? null : comparisonResult}
    />
  )
}
