import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getReceiptSettings } from '@/app/actions/receipt-settings'
import { sortStores } from '@/lib/store-order'
import { Settings } from 'lucide-react'
import ReceiptSettingsClient from '@/components/hq/receipt-settings-client'

export const dynamic = 'force-dynamic'

export default async function HQReceiptSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; type?: 'store' | 'ck' }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const params = await searchParams
  const type = params.type ?? 'store'

  const { data: storesRaw } = type === 'ck'
    ? await admin.from('stores').select('id, name').eq('active', true).eq('type', '央廚')
    : await admin.from('stores').select('id, name').eq('active', true).neq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  const storeId = params.storeId ?? stores[0]?.id ?? ''

  // 店面模式撈 receipt categories；央廚模式撈 ck_vendor_groups
  const { data: store } = storeId
    ? await admin.from('stores').select('name').eq('id', storeId).single()
    : { data: null }

  // 央廚也用兩層 receipt_categories/receipt_vendors（跟店面版一致）
  const initialData = storeId
    ? await getReceiptSettings(storeId)
    : []
  const initialCKGroups: any[] = []

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5' }}>
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Settings className="h-3.5 w-3.5" />
            HQ · 收據廠商設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b' }}>{store?.name ?? ''}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>
            {type === 'ck' ? '管理各央廚常用的廠商群組（供每日輸入 expense 時 datalist 建議）' : '統一管理各店結帳時使用的類別與廠商名稱'}
          </p>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-4">
        <ReceiptSettingsClient
          type={type}
          stores={stores}
          currentStoreId={storeId}
          initialCategories={initialData}
          initialCKGroups={initialCKGroups as any}
        />
      </div>
    </div>
  )
}
