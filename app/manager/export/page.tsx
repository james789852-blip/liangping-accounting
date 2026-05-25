import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import ExportClient from './client'

export default async function ExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return <div className="p-6 text-red-500">您尚未被指派到任何店家</div>

  const { data: store } = await supabase
    .from('stores').select('name').eq('id', storeId).single()

  return <ExportClient storeId={storeId} storeName={store?.name ?? ''} />
}
