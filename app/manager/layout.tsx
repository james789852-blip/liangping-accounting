import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import ManagerNav from '@/components/manager/nav'
import HQNav from '@/components/hq/nav'

const HQ_ROLES = ['顧問', '經理', '總監']

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  const isHQ = profile && HQ_ROLES.includes(profile.role)

  let storeId: string | null = null
  let storeName = ''
  let allStores: { id: string; name: string }[] = []

  if (isHQ) {
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
    const allStoreIds: string[] = profile.store_ids ?? []
    storeId = (cookieStoreId && allStoreIds.includes(cookieStoreId))
      ? cookieStoreId
      : allStoreIds[0] ?? null

    if (allStoreIds.length) {
      const { data: stores } = await supabase
        .from('stores')
        .select('id, name')
        .eq('active', true)
        .in('id', allStoreIds)
        .order('name')
      allStores = stores ?? []
      storeName = allStores.find(s => s.id === storeId)?.name ?? ''
    }
  } else {
    storeId = profile?.store_ids?.[0] ?? null
    if (storeId) {
      const { data: store } = await supabase
        .from('stores').select('name').eq('id', storeId).single()
      storeName = store?.name ?? ''
    }
  }

  // HQ 用戶：使用統一的深色側欄，含總公司端＋店長端導覽
  if (isHQ) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <HQNav
          userName={profile?.name ?? user.email ?? ''}
          role={profile?.role ?? ''}
          allStores={allStores}
          currentStoreId={storeId ?? ''}
        />
        <main className="flex-1 overflow-auto pt-12 pb-20 lg:pt-0 lg:pb-0">
          {children}
        </main>
      </div>
    )
  }

  // 一般店長：使用白色側欄
  return (
    <div className="flex min-h-screen bg-slate-50">
      <ManagerNav
        userName={profile?.name ?? user.email ?? ''}
        storeName={storeName}
        role={profile?.role ?? ''}
      />
      <main className="flex-1 overflow-auto pt-12 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
