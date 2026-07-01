import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { sortStores } from '@/lib/store-order'
import StoreOverviewClient from '@/components/hq/store-overview-client'

export const dynamic = 'force-dynamic'

export default async function StoreOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores').select('id, name').eq('active', true).neq('type', '央廚')
  const stores = sortStores(storesRaw ?? [])

  return <StoreOverviewClient stores={stores} />
}
