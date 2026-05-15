import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import HQNav from '@/components/hq/nav'

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  let allStores: { id: string; name: string }[] = []
  let currentStoreId = ''

  if (profile?.store_ids?.length) {
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
    const storeIds: string[] = profile.store_ids
    currentStoreId = (cookieStoreId && storeIds.includes(cookieStoreId))
      ? cookieStoreId
      : storeIds[0] ?? ''

    const { data: stores } = await supabase
      .from('stores')
      .select('id, name')
      .eq('active', true)
      .in('id', storeIds)
      .order('name')
    allStores = stores ?? []
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HQNav
        userName={profile?.name ?? user.email ?? ''}
        role={profile?.role ?? ''}
        allStores={allStores}
        currentStoreId={currentStoreId}
      />
      <main className="flex-1 overflow-auto pt-12 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
