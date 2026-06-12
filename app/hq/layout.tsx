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
    .select('name, role, store_ids, is_hq')
    .eq('user_id', user.id)
    .single()

  // 只有 is_hq 或老闆才能進總公司後台
  if (!profile || (!profile.is_hq && profile.role !== '老闆')) {
    redirect('/manager')
  }

  let allStores: { id: string; name: string; type?: string }[] = []
  let currentStoreId = ''

  const isOwner = profile.role === '老闆'
  const cookieStore = await cookies()
  const cookieStoreId = cookieStore.get('hq_viewing_store')?.value

  // 老闆或 is_hq 使用者均可看全部店家
  if (isOwner || profile.is_hq) {
    const { data: stores } = await supabase
      .from('stores').select('id, name, type').eq('active', true).order('name')
    allStores = stores ?? []
  } else if (profile.store_ids?.length) {
    const storeIds: string[] = profile.store_ids
    const { data: stores } = await supabase
      .from('stores').select('id, name, type').eq('active', true).in('id', storeIds).order('name')
    allStores = stores ?? []
  }

  if (allStores.length) {
    currentStoreId = (cookieStoreId && allStores.some(s => s.id === cookieStoreId))
      ? cookieStoreId
      : allStores[0].id
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HQNav
        userName={profile?.name ?? user.email ?? ''}
        role={profile?.role ?? ''}
        allStores={allStores}
        currentStoreId={currentStoreId}
      />
      <main className="flex-1 overflow-auto pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
