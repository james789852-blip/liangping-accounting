import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Package } from 'lucide-react'
import CKPriceEditor from '@/components/hq/ck-price-editor'

export const dynamic = 'force-dynamic'

export default async function CKPricesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  // 可瀏覽：總公司各角色 + 央廚管理人員
  const VIEW_ROLES = ['顧問', '經理', '總監', '老闆', '廠長', '副廠長']
  if (!profile || !VIEW_ROLES.includes(profile.role ?? '')) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  // 可編輯：經理以上 + 央廚廠長/副廠長
  const canEdit = ['經理', '總監', '老闆', '廠長', '副廠長'].includes(profile.role ?? '')

  const admin = createAdminClient()
  const { data: pricesRaw } = await admin
    .from('central_kitchen_prices').select('*').order('sort_order').order('item_name')

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
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>店長端只能填數量，單價由此設定。修改後當天起即時生效，歷史訂單不受影響。</p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <CKPriceEditor items={prices} priceHistory={history} canEdit={canEdit} />
      </div>
    </div>
  )
}
