import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import HQExcelClient from './client'
import { sortStores } from '@/lib/store-order'
import { canExportReports } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

export default async function HQExcelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, store_ids, is_hq, can_export_reports')
    .eq('user_id', user.id)
    .single()

  const canExportAll = canExportReports(profile) || profile?.is_hq === true || profile?.role === '老闆'
  const assignedStoreIds = (profile?.store_ids ?? []) as string[]
  if (!canExportAll && assignedStoreIds.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center" style={{ background: '#fafafa' }}>
        <p className="text-sm" style={{ color: '#a1a1aa' }}>尚未指派店家</p>
      </div>
    )
  }

  const admin = createAdminClient()
  let query = admin.from('stores').select('id, name, type').eq('active', true)
  if (!canExportAll) query = query.in('id', assignedStoreIds)
  const { data: storesRaw } = await query
  const stores = sortStores((storesRaw ?? []).filter((s: any) => (s.type ?? '店面') !== '央廚'))
  const ckStores = (storesRaw ?? [])
    .filter((s: any) => (s.type ?? '店面') === '央廚')
    .sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-Hant'))

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel 匯出
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>食耗成本匯出</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>選擇店家、央廚與期間，單筆或批次下載 Excel</p>
        </div>
      </div>
      <HQExcelClient stores={stores} ckStores={ckStores} />
    </div>
  )
}
