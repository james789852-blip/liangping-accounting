import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveStoreId } from '@/lib/get-effective-store'
import { getCachedStoreFull, getCachedUserProfile } from '@/lib/cached-queries'
import ActualVendorsManager, { ActualVendorManagerRow } from '@/components/manager/actual-vendors-manager'

export const dynamic = 'force-dynamic'

type ReceiptStatRow = {
  vendor_name: string | null
  actual_vendor_name: string | null
  total_amount: number | null
}

function statKey(vendorGroup: string | null | undefined, actualVendorName: string | null | undefined) {
  return `${vendorGroup ?? '未分類'}:::${actualVendorName ?? ''}`
}

export default async function ManagerSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getCachedUserProfile(user.id)
  const storeId = await getEffectiveStoreId(profile)
  if (!storeId) {
    return (
      <div className="p-6">
        <p className="text-red-500">您尚未被指派到任何店家，請聯絡系統管理員。</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const [store, { data: vendors }, { data: receipts }] = await Promise.all([
    getCachedStoreFull(storeId),
    admin
      .from('store_actual_vendors')
      .select('id, vendor_group, name, active, sort_order')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('vendor_group')
      .order('sort_order')
      .order('name'),
    admin
      .from('receipts')
      .select('vendor_name, actual_vendor_name, total_amount')
      .eq('store_id', storeId)
      .not('actual_vendor_name', 'is', null),
  ] as const)

  const stats = new Map<string, { count: number; total: number }>()
  for (const receipt of (receipts ?? []) as ReceiptStatRow[]) {
    const name = receipt.actual_vendor_name?.trim()
    if (!name) continue
    const key = statKey(receipt.vendor_name, name)
    const prev = stats.get(key) ?? { count: 0, total: 0 }
    stats.set(key, {
      count: prev.count + 1,
      total: prev.total + Number(receipt.total_amount ?? 0),
    })
  }

  const rows: ActualVendorManagerRow[] = ((vendors ?? []) as Array<{
    id: string
    vendor_group: string
    name: string
    active: boolean
  }>).map(vendor => {
    const stat = stats.get(statKey(vendor.vendor_group, vendor.name)) ?? { count: 0, total: 0 }
    return {
      id: vendor.id,
      vendor_group: vendor.vendor_group,
      name: vendor.name,
      active: vendor.active,
      receiptCount: stat.count,
      totalAmount: stat.total,
    }
  })

  return <ActualVendorsManager storeName={(store as any)?.name ?? '店長端'} vendors={rows} />
}

