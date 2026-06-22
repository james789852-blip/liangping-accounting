import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import AnalyticsClient from './client'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids, is_hq').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return (
    <div className="p-6 text-sm" style={{ color: '#be123c' }}>您尚未被指派到任何店家，請聯絡系統管理員。</div>
  )

  const { data: store } = await supabase.from('stores')
    .select('name, meeting_anchor_date, meeting_frequency_days').eq('id', storeId).single()

  return <AnalyticsClient
    storeId={storeId}
    storeName={store?.name ?? ''}
    meetingAnchorDate={(store?.meeting_anchor_date as string | null) ?? null}
    meetingFrequencyDays={(store?.meeting_frequency_days as number) ?? 14} />
}
