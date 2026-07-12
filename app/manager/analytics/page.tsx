import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import AnalyticsClient from './client'

export const dynamic = 'force-dynamic'

export default async function ManagerAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const { data: store } = await admin
    .from('stores')
    .select('name, type, ichef_uber_linked')
    .eq('id', storeId)
    .single()

  return (
    <AnalyticsClient
      storeId={storeId}
      storeName={(store?.name as string | null) ?? '我的店'}
      storeType={(store?.type as string | null) ?? null}
      ichefUberLinked={Boolean(store?.ichef_uber_linked)}
    />
  )
}
