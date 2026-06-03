import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import ReceiptSettings from '@/components/manager/receipt-settings'
import { Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids, is_hq').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return <div className="p-6 text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</div>
  }

  const { data: store } = await supabase.from('stores').select('name').eq('id', storeId).single()
  const categories = await getReceiptSettings(storeId)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Settings className="h-3.5 w-3.5" />
            {store?.name ?? ''}
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>收據設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>管理結帳時使用的類別與廠商名稱</p>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-5 pb-28">
        <ReceiptSettings storeId={storeId} initialCategories={categories} />
      </div>
    </div>
  )
}
