import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Boxes } from 'lucide-react'
import StoreItemsClient from '@/components/store-items-client'
import { sortStores } from '@/lib/store-order'
import { resolveHQStoreId } from '@/lib/hq-store-selection'
import { canManageItems } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

export default async function HQStoreItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!canManageItems(profile)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const admin = createAdminClient()
  const params = await searchParams
  const { data: storesRaw } = await admin
    .from('stores').select('id, name, type').eq('active', true)
  const stores = sortStores(storesRaw ?? []).filter((s: any) => s.type !== '央廚')
  const storeId = await resolveHQStoreId(stores, params.storeId)

  if (!storeId) {
    return <div className="p-6" style={{ color: '#a1a1aa' }}>尚無店家</div>
  }

  const [{ data: vgs }, { data: items }, { data: storeItems }] = await Promise.all([
    admin.from('system_vendor_groups').select('*').eq('active', true).order('sort_order'),
    admin.from('system_items').select('*').eq('active', true).order('sort_order'),
    admin.from('store_items').select('*').eq('store_id', storeId).order('sort_order'),
  ])

  const store = stores.find((s: any) => s.id === storeId)

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Boxes className="h-3.5 w-3.5" />
            店家品項管理
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>店家品項設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            勾選此店要啟用的全公司品項；或新增此店獨有品項。
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 pb-28">
        <StoreItemsClient
          mode="hq"
          stores={stores as any[]}
          storeId={storeId}
          storeName={(store as any)?.name ?? ''}
          vendorGroups={(vgs ?? []) as any[]}
          systemItems={(items ?? []) as any[]}
          initialStoreItems={(storeItems ?? []) as any[]}
        />
      </div>
    </div>
  )
}
