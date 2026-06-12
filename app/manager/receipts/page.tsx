import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import ReceiptsClient from '@/components/manager/receipts-client'

export const dynamic = 'force-dynamic'

export default async function ReceiptsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('name, role, store_ids').eq('user_id', user.id).single()

  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        您尚未被指派到任何店家，請聯絡系統管理員。
      </div>
    )
  }

  const today = getBusinessDate()
  const thirtyDaysAgo = new Date(new Date(today + 'T00:00:00+08:00').getTime() - 30 * 86400000)
    .toISOString().slice(0, 10)

  const admin = createAdminClient()
  const { data: receipts } = await admin
    .from('receipts')
    .select('*, receipt_items(*)')
    .eq('store_id', storeId)
    .gte('business_date', thirtyDaysAgo)
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false })

  const [{ data: store }, { data: mappingRows }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', storeId).single(),
    admin.from('item_column_mappings').select('item_name, excel_column, item_category, vendor_group').eq('store_id', storeId),
  ])

  const mappings = Object.fromEntries(
    (mappingRows ?? []).map(r => [r.item_name, { excel_column: r.excel_column, item_category: r.item_category, vendor_group: (r as any).vendor_group ?? null }])
  )

  return (
    <ReceiptsClient
      storeId={storeId}
      storeName={store?.name ?? ''}
      today={today}
      receipts={receipts ?? []}
      mappings={mappings}
    />
  )
}
