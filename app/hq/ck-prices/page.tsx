import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'
import CKPriceEditor from '@/components/hq/ck-price-editor'
import { canManageCKPrices } from '@/lib/user-permissions'
import { getBusinessDate } from '@/lib/business-date'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function CKPricesPage() {
  const supabase = await createClient()
  const user = await getAuthedUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()

  if (!profile || !canManageCKPrices(profile)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canEdit = canManageCKPrices(profile)

  const admin = createAdminClient()
  const [{ data: pricesRaw }, { data: storesRaw }, { data: overridesRaw }] = await Promise.all([
    admin.from('central_kitchen_prices').select('*').order('sort_order').order('item_name'),
    admin.from('stores').select('id, name, type').eq('active', true).neq('type', '央廚'),
    admin.from('central_kitchen_price_overrides')
      .select('id, central_kitchen_price_id, store_id, business_date, unit_price, reason, updated_by, created_at, updated_at')
      .order('business_date', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(100),
  ])

  // 把 prices 的 updated_by (user_id) 換成姓名 / 角色（給編輯器顯示「誰最後調整」）
  const priceUserIds = [...new Set((pricesRaw ?? []).map((p: any) => p.updated_by).filter(Boolean))]
  const priceNameMap = new Map<string, { name: string; role: string }>()
  if (priceUserIds.length > 0) {
    const { data: users } = await admin
      .from('user_profiles').select('user_id, name, role').in('user_id', priceUserIds)
    for (const u of (users ?? []) as any[]) {
      priceNameMap.set(u.user_id, { name: u.name, role: u.role })
    }
  }
  const prices = (pricesRaw ?? []).map((p: any) => ({
    ...p,
    updated_by_name: p.updated_by ? priceNameMap.get(p.updated_by)?.name ?? null : null,
    updated_by_role: p.updated_by ? priceNameMap.get(p.updated_by)?.role ?? null : null,
  }))

  const storeMap = new Map((storesRaw ?? []).map((store: any) => [store.id, store.name]))
  const priceMap = new Map(prices.map((price: any) => [price.id, price]))
  const overrideUserIds = [...new Set((overridesRaw ?? []).map((row: any) => row.updated_by).filter(Boolean))]
  const overrideNameMap = new Map<string, string>()
  if (overrideUserIds.length > 0) {
    const { data: users } = await admin
      .from('user_profiles').select('user_id, name').in('user_id', overrideUserIds)
    for (const item of users ?? []) overrideNameMap.set(item.user_id, item.name)
  }
  const overrides = (overridesRaw ?? []).map((row: any) => ({
    ...row,
    unit_price: Number(row.unit_price),
    store_name: storeMap.get(row.store_id) ?? '已停用店家',
    item_name: priceMap.get(row.central_kitchen_price_id)?.item_name ?? '已刪除品項',
    default_unit_price: Number(priceMap.get(row.central_kitchen_price_id)?.unit_price ?? 0),
    updated_by_name: row.updated_by ? overrideNameMap.get(row.updated_by) ?? '(未知)' : null,
  }))

  let history: any[] = []
  try {
    const { data } = await admin
      .from('central_kitchen_price_history')
      .select('item_name, old_price, new_price, reason, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(20)
    history = data ?? []

    // 把 changed_by (user_id) 換成姓名
    const userIds = [...new Set(history.map(h => h.changed_by).filter(Boolean))]
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from('user_profiles').select('user_id, name, role').in('user_id', userIds)
      const nameMap = new Map((users ?? []).map((u: any) => [u.user_id, { name: u.name, role: u.role }]))
      history = history.map(h => ({
        ...h,
        changed_by_name: nameMap.get(h.changed_by)?.name ?? '(未知)',
        changed_by_role: nameMap.get(h.changed_by)?.role ?? '',
      }))
    }
  } catch { /* table may not exist yet */ }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>
      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Package className="h-3.5 w-3.5" />
            系統設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>央廚配送單價管理</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>店長端只能填數量。標準單價適用所有店；單日特例只套用到指定店家與營業日，歷史訂單不受影響。</p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <CKPriceEditor
          items={prices}
          stores={sortStores(storesRaw ?? []).map(store => ({ id: String(store.id), name: String(store.name) }))}
          dailyOverrides={overrides}
          initialDate={getBusinessDate()}
          priceHistory={history}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}
