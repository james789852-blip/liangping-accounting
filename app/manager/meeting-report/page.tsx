import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthedUser } from '@/lib/authed-user'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getMeetingRevenueComparison, listMeetingReports } from '@/app/actions/meeting-reports'
import MeetingReportListClient from './list-client'

export const dynamic = 'force-dynamic'

function taipeiToday() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00+08:00`)
  value.setDate(value.getDate() + amount)
  return value.toISOString().slice(0, 10)
}

export default async function ManagerMeetingReportPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data: profile } = await supabase.from('user_profiles')
    .select('*').eq('user_id', user.id).single()
  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const today = taipeiToday()
  const currentStart = addDays(today, -13)
  const [storeResult, reportsResult, comparisonResult, openItemsResult] = await Promise.all([
    admin.from('stores')
      .select('name, meeting_anchor_date, meeting_frequency_days')
      .eq('id', storeId).single(),
    listMeetingReports(storeId),
    getMeetingRevenueComparison(storeId, currentStart, today),
    admin.from('meeting_action_items')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId).eq('status', 'open'),
  ])

  if ('error' in reportsResult) redirect('/manager/dashboard')
  const comparison = 'error' in comparisonResult ? null : comparisonResult

  return (
    <MeetingReportListClient
      storeId={storeId}
      storeName={(storeResult.data?.name as string | null) ?? '我的店'}
      meetingAnchorDate={(storeResult.data?.meeting_anchor_date as string | null) ?? null}
      meetingFrequencyDays={(storeResult.data?.meeting_frequency_days as number | null) ?? 14}
      reports={reportsResult.reports}
      dashboardPeriod={{ start: currentStart, end: today }}
      dashboardComparison={comparison}
      openActionCount={openItemsResult.count ?? 0}
    />
  )
}
