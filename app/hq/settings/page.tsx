import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Package, History, Settings } from 'lucide-react'
import CKPriceEditor from '@/components/hq/ck-price-editor'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['顧問', '經理', '總監'].includes(profile.role)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canEdit = ['經理', '總監'].includes(profile.role)

  const [{ data: ckPrices }, { data: priceHistory }] = await Promise.all([
    supabase
      .from('central_kitchen_prices')
      .select('id, item_name, unit_price, updated_at')
      .eq('active', true)
      .order('sort_order').order('item_name'),
    supabase
      .from('central_kitchen_price_history')
      .select('id, item_name, old_price, new_price, changed_at, reason')
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <Settings className="h-3.5 w-3.5" />
            系統設定
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>系統設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>
            {canEdit ? '可編輯央廚配送單價' : '顧問僅可查看，無法編輯'}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-28">

        {/* 央廚配送單價 */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#fff7ed' }}>
                <Package className="h-4 w-4" style={{ color: '#f97316' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#18181b' }}>央廚配送單價設定</p>
                <p className="text-xs" style={{ color: '#a1a1aa' }}>
                  共 {ckPrices?.length ?? 0} 個品項 · {canEdit ? '點鉛筆圖示可修改' : '僅供查看'}
                </p>
              </div>
            </div>
          </div>
          <CKPriceEditor items={ckPrices ?? []} canEdit={canEdit} />
        </div>

        {/* 異動紀錄 */}
        {priceHistory && priceHistory.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #f4f4f5' }}>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: '#f4f4f5' }}>
                  <History className="h-4 w-4" style={{ color: '#71717a' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: '#18181b' }}>近期異動紀錄</p>
              </div>
            </div>
            <div>
              {priceHistory.map((h, idx) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: idx !== priceHistory.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: '#18181b' }}>{h.item_name}</p>
                    <p className="text-xs" style={{ color: '#a1a1aa' }}>
                      {new Date(h.changed_at).toLocaleString('zh-TW')}
                      {h.reason && ` · ${h.reason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="tabular-nums" style={{ color: '#a1a1aa' }}>${h.old_price}</span>
                    <span style={{ color: '#d4d4d8' }}>→</span>
                    <span className="font-bold tabular-nums" style={{ color: '#18181b' }}>${h.new_price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
