import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Store as StoreIcon } from 'lucide-react'
import StoreEditor from '@/components/hq/store-editor'
import AddStoreForm from '@/components/hq/add-store-form'

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
    .select('id, name, mode, ichef_uber_linked, uber_enabled, uber_accounts, panda_enabled, twpay_enabled, online_enabled, petty_cash')
    .eq('active', true)
    .order('name')

  if (!isAdmin && profile?.store_ids?.length) {
    query = query.in('id', profile.store_ids) as typeof query
  }

  const { data: stores } = await query

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

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3 pb-28">
        {(stores ?? []).map(store => (
          <StoreEditor
            key={store.id}
            store={{ ...store, uber_accounts: store.uber_accounts ?? [] }}
            canEdit={canEdit}
          />
        ))}

        {canEdit && <AddStoreForm />}

        {!canEdit && (
          <p className="text-xs text-center pt-2" style={{ color: '#a1a1aa' }}>顧問角色僅可檢視，無法修改設定</p>
        )}
      </div>
    </div>
  )
}
