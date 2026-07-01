import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import ReceiptSettings from '@/components/manager/receipt-settings'
import { sortStores } from '@/lib/store-order'
import { Settings } from 'lucide-react'
import StoreSelector from '@/components/hq/receipt-settings-store-selector'

export const dynamic = 'force-dynamic'

export default async function HQReceiptSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores').select('id, name').eq('active', true).neq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  const params = await searchParams
  const storeId = params.storeId ?? stores[0]?.id ?? ''
  if (!storeId) {
    return <div className="p-6 text-red-500">無店家可管理。</div>
  }

  const [{ data: store }, categories] = await Promise.all([
    admin.from('stores').select('name').eq('id', storeId).single(),
    getReceiptSettings(storeId),
  ])

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Settings className="h-3.5 w-3.5" />
            HQ · 店家收據廠商設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>{store?.name ?? ''}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>統一管理各店結帳時使用的類別與廠商名稱</p>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        <StoreSelector stores={stores} currentStoreId={storeId} />
        <ReceiptSettings storeId={storeId} initialCategories={categories} />
      </div>
    </div>
  )
}
