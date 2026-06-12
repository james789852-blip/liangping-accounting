import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import ManagerNav from '@/components/manager/nav'
import HQNav from '@/components/hq/nav'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids, is_hq')
    .eq('user_id', user.id)
    .single()

  const isHQ = profile && (profile.is_hq || profile.role === '老闆')

  let storeId: string | null = null
  let storeName = ''
  let storeType = '店面'
  let allStores: { id: string; name: string }[] = []

  if (isHQ) {
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value

    // 老闆或 is_hq 使用者均可切換到任何店家
    if (profile.role === '老闆' || profile.is_hq) {
      const { data: stores } = await supabase
        .from('stores').select('id, name, type').eq('active', true).order('name')
      allStores = stores ?? []
    } else {
      const allStoreIds: string[] = profile.store_ids ?? []
      if (allStoreIds.length) {
        const { data: stores } = await supabase
          .from('stores').select('id, name, type').eq('active', true).in('id', allStoreIds).order('name')
        allStores = stores ?? []
      }
    }

    if (allStores.length) {
      storeId = (cookieStoreId && allStores.some(s => s.id === cookieStoreId))
        ? cookieStoreId
        : allStores[0].id
      const currentStore = (allStores as { id: string; name: string; type?: string }[]).find(s => s.id === storeId)
      storeName = currentStore?.name ?? ''
      storeType = currentStore?.type ?? '店面'
    }
  } else {
    storeId = profile?.store_ids?.[0] ?? null
    if (storeId) {
      const { data: store } = await supabase
        .from('stores').select('name, type').eq('id', storeId).single()
      storeName = (store as any)?.name ?? ''
      storeType = (store as any)?.type ?? '店面'
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
        <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
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
        storeType={storeType}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
