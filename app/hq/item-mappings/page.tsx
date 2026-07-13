import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ItemMappingsClient from '@/components/hq/item-mappings-client'
import { sortStores } from '@/lib/store-order'
import { fetchAllPaged } from '@/lib/supabase-paged'
import { resolveHQStoreId } from '@/lib/hq-store-selection'
import { canManageCKItems, canManageStoreItems } from '@/lib/user-permissions'

export const dynamic = 'force-dynamic'

export default async function ItemMappingsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>
}) {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  const canStoreItems = canManageStoreItems(profile)
  const canCKItems = canManageCKItems(profile)
  if (!canStoreItems && !canCKItems) redirect('/manager/dashboard')

  const admin = createAdminClient()
  const [{ data: stores }, { data: vgsInitial }] = await Promise.all([
    admin.from('stores').select('id, name, type').eq('active', true).order('name'),
    admin.from('system_vendor_groups').select('id, name, sort_order, doc_type').eq('active', true).order('sort_order'),
  ])

  const params = await searchParams
  // 沒有 URL storeId 時，跟隨總公司左側「切換店家」目前選擇，避免每次回第一家店。
  const sortedStores = sortStores((stores ?? []).filter((s: any) => {
    const type = (s.type ?? '店面') as string
    return type === '央廚' ? canCKItems : canStoreItems
  }))
  const storeId = await resolveHQStoreId(sortedStores, params.storeId)
  const mappings = await fetchAllPaged<any>(() =>
    admin.from('item_column_mappings')
      .select('*')
      .order('sort_order')
      .order('item_category')
      .order('item_name')
  )
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
  const storeMappingCounts = (mappings ?? []).reduce<Record<string, number>>((acc, row) => {
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
