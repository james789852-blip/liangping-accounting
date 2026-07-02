import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CleanupOrphanClient from '@/components/hq/cleanup-orphan-client'

export const dynamic = 'force-dynamic'

export default async function CleanupOrphanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  return <CleanupOrphanClient />
}
