import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ManagerNav from '@/components/manager/nav'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role, store_ids')
    .eq('user_id', user.id)
    .single()

  let storeName = ''
  if (profile?.store_ids?.length) {
    const { data: store } = await supabase
      .from('stores')
      .select('name')
      .eq('id', profile.store_ids[0])
      .single()
    storeName = store?.name ?? ''
  }

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
