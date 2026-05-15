import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HQNav from '@/components/hq/nav'

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, role')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <HQNav userName={profile?.name ?? user.email ?? ''} role={profile?.role ?? ''} />
      <main className="flex-1 overflow-auto pt-12 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  )
}
