import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ItemMappingsClient from '@/components/hq/item-mappings-client'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function ItemMappingsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') redirect('/manager/dashboard')

  const admin = createAdminClient()
  const [{ data: stores }, { data: mappings }, { data: vgs }] = await Promise.all([
    admin.from('stores').select('id, name').eq('active', true).order('name'),
    admin.from('item_column_mappings').select('*').order('sort_order').order('item_category').order('item_name').limit(10000),
    admin.from('system_vendor_groups').select('id, name, sort_order').eq('active', true).order('sort_order'),
  ])

  const params = await searchParams
  const storeId = params.storeId ?? ''

  return (
    <ItemMappingsClient
      mappings={mappings ?? []}
      stores={sortStores(stores ?? [])}
      vendorGroups={vgs ?? []}
      selectedStoreId={storeId}
    />
  )
}
