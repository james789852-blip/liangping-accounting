import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ItemMappingsClient from '@/components/hq/item-mappings-client'
import { sortStores } from '@/lib/store-order'
import { fetchAllPaged } from '@/lib/supabase-paged'

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
  const [{ data: stores }, mappings, { data: vgs }, sysItems, storeItems] = await Promise.all([
    admin.from('stores').select('id, name').eq('active', true).order('name'),
    // 分頁撈：mapping 表總筆數可能 > 1000（PostgREST 預設 max-rows）
    fetchAllPaged<any>(() => admin.from('item_column_mappings').select('*').order('sort_order').order('item_category').order('item_name')),
    admin.from('system_vendor_groups').select('id, name, sort_order, doc_type').eq('active', true).order('sort_order'),
    fetchAllPaged<any>(() => admin.from('system_items').select('id, name, doc_type_override').eq('active', true)),
    fetchAllPaged<any>(() => admin.from('store_items').select('store_id, system_item_id, doc_type_override').eq('enabled', true)),
  ])

  const params = await searchParams
  const storeId = params.storeId ?? ''

  // 幫每個 mapping 加 doc_type_override 資訊
  const sysByName = new Map((sysItems ?? []).map((s: any) => [s.name as string, { id: s.id as string, override: s.doc_type_override as string | null }]))
  const storeOverrideMap = new Map<string, string | null>()
  for (const si of storeItems ?? []) {
    storeOverrideMap.set(`${si.store_id}||${si.system_item_id}`, si.doc_type_override ?? null)
  }
  const enrichedMappings = (mappings ?? []).map((m: any) => {
    const sys = sysByName.get(m.item_name)
    let override: string | null = sys?.override ?? null
    if (m.store_id && sys) {
      const storeOverride = storeOverrideMap.get(`${m.store_id}||${sys.id}`)
      if (storeOverride !== undefined) override = storeOverride
    }
    return { ...m, doc_type_override: override }
  })

  return (
    <ItemMappingsClient
      mappings={enrichedMappings}
      stores={sortStores(stores ?? [])}
      vendorGroups={vgs ?? []}
      selectedStoreId={storeId}
    />
  )
}
