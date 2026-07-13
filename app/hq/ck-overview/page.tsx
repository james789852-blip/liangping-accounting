import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { sortStores } from '@/lib/store-order'
import CKOverviewClient from '@/components/hq/ck-overview-client'
import { resolveHQStoreId } from '@/lib/hq-store-selection'

export const dynamic = 'force-dynamic'

export default async function CKOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: storesRaw } = await admin
    .from('stores').select('id, name').eq('active', true).eq('type', '央廚')
  const ckStores = sortStores(storesRaw ?? [])

  const params = await searchParams
  const initialStoreId = await resolveHQStoreId(ckStores, params.storeId)

  return <CKOverviewClient stores={ckStores} initialStoreId={initialStoreId} />
}
