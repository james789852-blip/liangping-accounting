import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ItemMappingsClient from '@/components/hq/item-mappings-client'
import { sortStores } from '@/lib/store-order'
import { fetchAllPaged } from '@/lib/supabase-paged'
import { resolveHQStoreId } from '@/lib/hq-store-selection'

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
  const [{ data: stores }, { data: vgsInitial }] = await Promise.all([
    admin.from('stores').select('id, name').eq('active', true).order('name'),
    admin.from('system_vendor_groups').select('id, name, sort_order, doc_type').eq('active', true).order('sort_order'),
  ])

  const params = await searchParams
  // 沒有 URL storeId 時，跟隨總公司左側「切換店家」目前選擇，避免每次回第一家店。
  const sortedStores = sortStores(stores ?? [])
  const storeId = await resolveHQStoreId(sortedStores, params.storeId)
  const mappings = await fetchAllPaged<any>(() => {
    const query = admin.from('item_column_mappings')
      .select('*')
      .order('sort_order')
      .order('item_category')
      .order('item_name')
    return storeId
      ? query.or(`store_id.is.null,store_id.eq.${storeId}`)
      : query.is('store_id', null)
  })
  // 自動同步 orphan vg：目前載入範圍內 mapping 用到但 system_vendor_groups 沒 record 的 → 補建
  const knownVgNames = new Set((vgsInitial ?? []).map(v => v.name as string))
  const orphanVgs = new Set<string>()
  for (const m of mappings ?? []) {
    const vg = (m.vendor_group ?? '').trim()
    if (vg && vg !== '未分類' && !knownVgNames.has(vg)) orphanVgs.add(vg)
  }
  let vgs = vgsInitial
  if (orphanVgs.size > 0) {
    const maxSort = Math.max(0, ...(vgsInitial ?? []).map(v => v.sort_order ?? 0))
    const inserts = [...orphanVgs].map((name, i) => ({
      name, kind: 'vendor', sort_order: maxSort + (i + 1) * 10, active: true,
    }))
    await admin.from('system_vendor_groups').insert(inserts)
    const { data: refetched } = await admin
      .from('system_vendor_groups')
      .select('id, name, sort_order, doc_type')
      .eq('active', true)
      .order('sort_order')
    vgs = refetched
  }
  const mappingCountsRaw = await fetchAllPaged<{ store_id: string | null }>(() =>
    admin.from('item_column_mappings').select('store_id').not('store_id', 'is', null)
  )
  const storeMappingCounts = mappingCountsRaw.reduce<Record<string, number>>((acc, row) => {
    if (row.store_id) acc[row.store_id] = (acc[row.store_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <ItemMappingsClient
      mappings={mappings ?? []}
      stores={sortedStores}
      vendorGroups={vgs ?? []}
      selectedStoreId={storeId}
      storeMappingCounts={storeMappingCounts}
    />
  )
}
