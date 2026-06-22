import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import HQExcelClient from './client'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function HQExcelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids, is_hq').eq('user_id', user.id).single()

  if (!profile?.store_ids?.length) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <p className="text-sm" style={{ color: '#a1a1aa' }}>尚未指派店家</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores')
    .select('id, name')
    .eq('active', true)
    .in('id', profile.store_ids)
  const stores = sortStores(storesRaw ?? [])

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel 匯出
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>食耗成本匯出</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>選擇店家與月份，下載當月食耗成本報表</p>
        </div>
      </div>
      <HQExcelClient stores={stores} />
    </div>
  )
}
