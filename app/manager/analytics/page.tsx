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

  // 店長端看到「開發中」訊息；HQ / 老闆看到完整內容
  const isPrivileged = profile?.is_hq || profile?.role === '老闆'
  if (!isPrivileged) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#fafafa' }}>
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #f4f4f5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div className="text-4xl mb-3">🚧</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#18181b' }}>營運洞察 · 開發中</h1>
          <p className="text-sm" style={{ color: '#71717a' }}>此頁面正在開發中，敬請期待完整版上線。</p>
        </div>
      </div>
    )
  }

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
