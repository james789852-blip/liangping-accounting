import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import OrderClient from '@/components/manager/order-client'

export const dynamic = 'force-dynamic'

export default async function OrderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) return (
    <div className="p-6 text-center text-slate-500 text-sm">您尚未被指派到任何店家。</div>
  )

  const today = getBusinessDate()
  const firstOfMonth = today.slice(0, 7) + '-01'

  const admin = createAdminClient()
  const [{ data: store }, { data: receipts }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', storeId).single(),
    admin.from('receipts')
      .select('*, receipt_items(*)')
      .eq('store_id', storeId)
      .gte('business_date', firstOfMonth)
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  return (
    <OrderClient
      storeName={store?.name ?? ''}
      storeId={storeId}
      today={today}
      month={today.slice(0, 7)}
      receipts={receipts ?? []}
    />
  )
}
