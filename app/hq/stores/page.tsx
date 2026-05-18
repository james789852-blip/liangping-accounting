import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StoreEditor from '@/components/hq/store-editor'

export default async function StoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, store_ids')
    .eq('user_id', user.id)
    .single()

  if (!profile?.store_ids?.length) {
    return <div className="p-6 text-slate-500">尚未指派店家</div>
  }

  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, mode, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, petty_cash')
    .eq('active', true)
    .in('id', profile.store_ids)
    .order('name')

  const canEdit = ['經理', '總監'].includes(profile.role ?? '')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">店家管理</h1>
        <p className="text-sm text-slate-500 mt-1">設定各店的營業模式、外送平台帳號與零用金</p>
      </div>

      <div className="space-y-3">
        {(stores ?? []).map(store => (
          <StoreEditor
            key={store.id}
            store={{
              ...store,
              uber_accounts: store.uber_accounts ?? [],
            }}
            canEdit={canEdit}
          />
        ))}
      </div>

      {!canEdit && (
        <p className="text-xs text-slate-400 text-center pt-2">顧問角色僅可檢視，無法修改設定</p>
      )}
    </div>
  )
}
