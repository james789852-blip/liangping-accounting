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

  // 判定一致：is_hq 旗標為主，老闆也算總公司
  const isHQ = !!profile?.is_hq || profile?.role === '老闆'
  redirect(isHQ ? '/hq/dashboard' : '/manager/dashboard')
}
