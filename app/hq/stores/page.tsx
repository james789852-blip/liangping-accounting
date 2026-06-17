import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Store as StoreIcon } from 'lucide-react'
import StoreEditor from '@/components/hq/store-editor'
import AddStoreForm from '@/components/hq/add-store-form'
import { sortStores } from '@/lib/store-order'

export const dynamic = 'force-dynamic'

export default async function StoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()

  if (!profile?.is_hq && !['老闆', '經理', '總監'].includes(profile?.role ?? '')) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足</div>
  }

  const canEdit = ['老闆', '經理', '總監'].includes(profile?.role ?? '')
  const isAdmin = profile?.is_hq || profile?.role === '老闆'

  const admin = createAdminClient()

  // 老闆 / is_hq 看全部店家，其他只看自己負責的
  let query = admin
    .from('stores')
    .select('id, name, mode, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, petty_cash, type, assigned_store_ids, google_sheets_id')
    .eq('active', true)

  if (!isAdmin && profile?.store_ids?.length) {
    query = query.in('id', profile.store_ids) as typeof query
  }

  const { data: storesRaw } = await query
  const stores = sortStores(storesRaw ?? [])

  // 供央廚店家設定「服務店家」用的店面清單
  const { data: memberStoreOptionsRaw } = await admin
    .from('stores')
    .select('id, name')
    .eq('active', true)
    .eq('type', '店面')
  const memberStoreOptions = sortStores(memberStoreOptionsRaw ?? [])

  // 各央廚目前的體系外店家
  const ckStoreIds = stores.filter(s => (s as any).type === '央廚').map(s => s.id)
  const { data: allExternalStores } = ckStoreIds.length > 0
    ? await admin.from('ck_external_stores').select('id, ck_store_id, name').in('ck_store_id', ckStoreIds).order('created_at')
    : { data: [] }

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
            <StoreIcon className="h-3.5 w-3.5" />
            店家管理
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>店家設定</h1>
          <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>設定各店的營業模式、外送平台帳號與零用金</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 pb-28 space-y-6">
        {(['店面', '央廚'] as const).map(type => {
          const group = stores.filter(s => ((s as any).type ?? '店面') === type)
          if (group.length === 0) return null
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{ background: type === '央廚' ? '#fef3c7' : '#f0fdf4', color: type === '央廚' ? '#b45309' : '#15803d' }}>
                  {type}
                </span>
                <span className="text-xs" style={{ color: '#a1a1aa' }}>{group.length} 間</span>
              </div>
              <div className="space-y-3">
                {group.map(store => (
                  <StoreEditor
                    key={store.id}
                    store={{ ...store, uber_accounts: store.uber_accounts ?? [], type: (store as any).type ?? '店面', assigned_store_ids: (store as any).assigned_store_ids ?? [], google_sheets_id: (store as any).google_sheets_id ?? '' }}
                    canEdit={canEdit}
                    memberStoreOptions={type === '央廚' ? memberStoreOptions : []}
                    externalStores={type === '央廚' ? (allExternalStores ?? []).filter((e: any) => e.ck_store_id === store.id).map((e: any) => ({ id: e.id, name: e.name })) : []}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {canEdit && <AddStoreForm />}

        {!canEdit && (
          <p className="text-xs text-center pt-2" style={{ color: '#a1a1aa' }}>顧問角色僅可檢視，無法修改設定</p>
        )}
      </div>
    </div>
  )
}
