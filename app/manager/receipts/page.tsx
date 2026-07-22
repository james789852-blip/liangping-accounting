import { getAuthedUser } from '@/lib/authed-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getBusinessDate } from '@/lib/business-date'
import ReceiptsClient from '@/components/manager/receipts-client'
import { getStoreItemsResolved } from '@/lib/store-items-resolver'
import { getStoreItemsFromMappings } from '@/lib/mapping-based-items'
import { getCachedStoreById, getCachedUserProfile } from '@/lib/cached-queries'

export const dynamic = 'force-dynamic'

export default async function ReceiptsPage() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)

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

  const [store, mappingBasedItems] = await Promise.all([
    getCachedStoreById(storeId),
    getStoreItemsFromMappings(storeId),
  ])

  const [newItems, { data: mappingRows }] = mappingBasedItems.length > 0
    ? [[], { data: [] }] as const
    : await Promise.all([
        getStoreItemsResolved(storeId),
        admin.from('item_column_mappings').select('item_name, excel_column, item_category, vendor_group').eq('store_id', storeId),
      ])

  // 優先用 mapping-based（跟 xlsx 匯出同源）→ newItems → 舊 mapping
  // 保留同名但不同廠商分類的品項（例如「免洗｜酒精」與「日常用品｜酒精」），
  // 不再用 item_name 當 object key 造成其中一筆被覆蓋。
  const mappings = mappingBasedItems.length > 0
    ? mappingBasedItems.map(i => ({ item_name: i.name, excel_column: i.name, item_category: i.category, vendor_group: i.vendor_group }))
    : newItems.length > 0
    ? newItems.map(i => ({ item_name: i.name, excel_column: i.name, item_category: i.category, vendor_group: i.vendor_group }))
    : (mappingRows ?? []).map(r => ({ item_name: r.item_name, excel_column: r.excel_column, item_category: r.item_category, vendor_group: r.vendor_group ?? null }))

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
