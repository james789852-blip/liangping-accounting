import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { createAdminClient } from '@/lib/supabase/admin'
import MeetingReportListClient from './list-client'

export const dynamic = 'force-dynamic'

export default async function MeetingReportListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return (
    <div className="p-6 text-sm" style={{ color: '#be123c' }}>您尚未被指派到任何店家</div>
  )

  const admin = createAdminClient()
  const { data: store } = await admin.from('stores')
    .select('name, meeting_anchor_date, meeting_frequency_days').eq('id', storeId).single()
  const { data: reports } = await admin.from('meeting_reports')
    .select('id, period_start, period_end, meeting_date, status, updated_at')
    .eq('store_id', storeId)
    .order('period_end', { ascending: false })

  return <MeetingReportListClient
    storeId={storeId}
    storeName={(store?.name as string) ?? ''}
    meetingAnchorDate={(store?.meeting_anchor_date as string | null) ?? null}
    meetingFrequencyDays={(store?.meeting_frequency_days as number) ?? 14}
    reports={(reports ?? []) as any[]} />
}
