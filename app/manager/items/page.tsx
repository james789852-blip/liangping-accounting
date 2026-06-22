import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Boxes } from 'lucide-react'
import StoreItemsClient from '@/components/store-items-client'
import { getEffectiveStoreId } from '@/lib/get-effective-store'

export const dynamic = 'force-dynamic'

export default async function ManagerItemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, store_ids').eq('user_id', user.id).single()
  if (!profile) return <div className="p-6" style={{ color: '#be123c' }}>找不到帳號</div>

  const storeId = await getEffectiveStoreId(profile as any)
  if (!storeId) {
    return <div className="p-6" style={{ color: '#a1a1aa' }}>請先指派店家</div>
  }

  const admin = createAdminClient()
  const [{ data: store }, { data: vgs }, { data: items }, { data: storeItems }] = await Promise.all([
    admin.from('stores').select('name').eq('id', storeId).single(),
    admin.from('system_vendor_groups').select('*').eq('active', true).order('sort_order'),
    admin.from('system_items').select('*').eq('active', true).order('sort_order'),
    admin.from('store_items').select('*').eq('store_id', storeId).order('sort_order'),
  ])

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Boxes className="h-3.5 w-3.5" />
            品項管理
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>我的店家品項</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            勾選此店要使用的品項；可新增本店獨有品項。
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <StoreItemsClient
          mode="manager"
          stores={[]}
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
