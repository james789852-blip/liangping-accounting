import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_hq')
    .eq('user_id', user.id)
    .single()

  // 店家角色（店長/副店長/廠長/副廠長）一律進 manager dashboard，不論 is_hq
  const STORE_ROLES = ['店長', '副店長', '廠長', '副廠長']
  const isStoreRole = STORE_ROLES.includes(profile?.role ?? '')
  const isHQ = !isStoreRole && (!!profile?.is_hq || profile?.role === '老闆')
  redirect(isHQ ? '/hq/dashboard' : '/manager/dashboard')
}
