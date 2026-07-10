import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import UserCreateDialog from '@/components/hq/user-create-dialog'
import UserEditDialog from '@/components/hq/user-edit-dialog'
import { Users, Building2 } from 'lucide-react'
import { sortStores } from '@/lib/store-order'
import { canManageUsers } from '@/lib/user-permissions'

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  '老闆':   { bg: '#fef3c7', color: '#b45309' },
  '總監':   { bg: '#f3e8ff', color: '#7c3aed' },
  '經理':   { bg: '#FFFBEB', color: '#92400E' },
  '顧問':   { bg: '#e0f2fe', color: '#0369a1' },
  '廠長':   { bg: '#fef9c3', color: '#854d0e' },
  '副廠長': { bg: '#fefce8', color: '#a16207' },
  '店長':   { bg: '#d1fae5', color: '#047857' },
  '副店長': { bg: '#ecfdf5', color: '#059669' },
  '小幫手': { bg: '#eef2ff', color: '#4f46e5' },
  '助理':   { bg: '#f4f4f5', color: '#71717a' },
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()

  if (!canManageUsers(profile)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足，需要老闆或帳號管理權限</div>
  }

  const { data: users } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: storesRaw } = await supabase
    .from('stores').select('id, name, type').eq('active', true)
  const stores = sortStores(storesRaw ?? [])

  const storeMap = Object.fromEntries(stores.map(s => [s.id, s.name]))

  // 用 admin client 取得所有使用者帳號（email → 身分證字號）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const accountMap: Record<string, string> = Object.fromEntries(
    (authList?.users ?? []).map(u => [
      u.id,
      (u.email ?? '').replace('@liang-ping.com', '').toUpperCase(),
    ])
  )

  return (
    <div className="min-h-full" style={{ background: '#fafafa' }}>

      <div className="bg-white px-6 py-5" style={{ borderBottom: '1px solid #f4f4f5', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="max-w-3xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#a1a1aa' }}>
              <Users className="h-3.5 w-3.5" />
              帳號管理
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#18181b', letterSpacing: '-0.01em' }}>使用者帳號</h1>
            <p className="text-sm mt-0.5" style={{ color: '#a1a1aa' }}>共 {users?.length ?? 0} 個帳號</p>
          </div>
          <div className="mt-1">
            <UserCreateDialog stores={stores} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          {(users ?? []).map((u, idx) => {
            const isOwner = u.role === '老闆'
            const displayTitle = u.title || u.role
            const roleSt = ROLE_STYLE[u.role] ?? { bg: '#f4f4f5', color: '#71717a' }
            return (
              <div key={u.user_id}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: idx !== (users?.length ?? 0) - 1 ? '1px solid #f4f4f5' : 'none' }}>

                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
                  {(u.name || '?').slice(0, 1)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: '#18181b' }}>{u.name}</span>
                    {u.employee_id && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: '#f4f4f5', color: '#71717a' }}>
                        {u.employee_id}
                      </span>
                    )}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: roleSt.bg, color: roleSt.color }}>
                      {displayTitle}
                    </span>
                    {(isOwner || u.is_hq) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FEF3C7' }}>
                        <Building2 className="h-3 w-3" /> 總公司
                      </span>
                    )}
                    {!u.active && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#ffe4e6', color: '#be123c' }}>已停用</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#a1a1aa' }}>
                    {accountMap[u.user_id] && (
                      <span className="font-mono mr-2">{accountMap[u.user_id]}</span>
                    )}
                    {isOwner || (stores && stores.length > 0 && (u.store_ids ?? []).length >= stores.length)
                      ? '全部店面'
                      : [...new Set((u.store_ids ?? []) as string[])].map(id => storeMap[id]).filter(Boolean).join('、') || '未指派店家'
                    }
                  </p>
                  {u.primary_store_id && storeMap[u.primary_store_id] && !isOwner && (
                    <p className="text-[11px] mt-0.5" style={{ color: '#0369a1' }}>
                      主店：<span className="font-semibold">{storeMap[u.primary_store_id]}</span>
                    </p>
                  )}
                </div>

                <UserEditDialog user={{ ...u, account: accountMap[u.user_id] ?? '' }} stores={stores} />
              </div>
            )
          })}
          {(!users || users.length === 0) && (
            <div className="py-12 text-center text-sm" style={{ color: '#a1a1aa' }}>尚無帳號</div>
          )}
        </div>
      </div>
    </div>
  )
}
