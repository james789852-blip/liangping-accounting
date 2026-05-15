import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, History } from 'lucide-react'
import CKPriceEditor from '@/components/hq/ck-price-editor'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['顧問', '經理', '總監'].includes(profile.role)) {
    return <div className="p-6 text-red-500">權限不足</div>
  }

  const canEdit = ['經理', '總監'].includes(profile.role)

  const [{ data: ckPrices }, { data: priceHistory }] = await Promise.all([
    supabase
      .from('central_kitchen_prices')
      .select('id, item_name, unit_price, updated_at')
      .eq('active', true)
      .order('item_name'),
    supabase
      .from('central_kitchen_price_history')
      .select('id, item_name, old_price, new_price, changed_at, reason')
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">系統設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {canEdit ? '可編輯央廚配送單價' : '顧問僅可查看，無法編輯'}
        </p>
      </div>

      {/* 央廚配送單價 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            央廚配送單價設定
          </CardTitle>
          <p className="text-xs text-slate-400">
            共 {ckPrices?.length ?? 0} 個品項 · 點鉛筆圖示可修改
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <CKPriceEditor items={ckPrices ?? []} canEdit={canEdit} />
        </CardContent>
      </Card>

      {/* 異動紀錄 */}
      {priceHistory && priceHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5 text-slate-400" />
              近期異動紀錄
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {priceHistory.map(h => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1">
                    <p className="text-sm text-slate-900 font-medium">{h.item_name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(h.changed_at).toLocaleString('zh-TW')}
                      {h.reason && ` · ${h.reason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-slate-400 tabular-nums">${h.old_price}</span>
                    <span className="text-slate-300">→</span>
                    <span className="font-semibold text-slate-900 tabular-nums">${h.new_price}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
