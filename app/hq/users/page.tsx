import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UserCreateDialog from '@/components/hq/user-create-dialog'
import UserToggle from '@/components/hq/user-toggle'
import UserHQToggle from '@/components/hq/user-hq-toggle'
import { Users, Building2 } from 'lucide-react'

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  '老闆':  { bg: '#fef3c7', color: '#b45309' },
  '總監':  { bg: '#f3e8ff', color: '#7c3aed' },
  '經理':  { bg: '#eef2ff', color: '#4338ca' },
  '顧問':  { bg: '#e0f2fe', color: '#0369a1' },
  '店長':  { bg: '#d1fae5', color: '#047857' },
  '副店長': { bg: '#ecfdf5', color: '#059669' },
  '助理':  { bg: '#f4f4f5', color: '#71717a' },
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['經理', '總監', '老闆'].includes(profile.role)) {
    return <div className="p-6" style={{ color: '#be123c' }}>權限不足，僅限經理以上查看</div>
  }

  const canManageHQ = ['總監', '老闆'].includes(profile.role)

  const { data: users } = await supabase
    .from('user_profiles')
    .select('user_id, name, role, store_ids, is_hq, active, created_at')
    .order('created_at', { ascending: false })

  const { data: stores } = await supabase
    .from('stores').select('id, name').eq('active', true).order('name')

  const storeMap = Object.fromEntries((stores ?? []).map(s => [s.id, s.name]))

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
            <UserCreateDialog stores={stores ?? []} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28">
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          {(users ?? []).map((u, idx) => {
            const isOwner = u.role === '老闆'
            const roleSt = ROLE_STYLE[u.role] ?? { bg: '#f4f4f5', color: '#71717a' }
            return (
              <div key={u.user_id}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: idx !== (users?.length ?? 0) - 1 ? '1px solid #f4f4f5' : 'none' }}>
                {/* 頭像 */}
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {(u.name || '?').slice(0, 1)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: '#18181b' }}>{u.name}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: roleSt.bg, color: roleSt.color }}>
                      {u.role}
                    </span>
                    {(isOwner || u.is_hq) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff' }}>
                        <Building2 className="h-3 w-3" /> 總公司
                      </span>
                    )}
                    {!u.active && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#ffe4e6', color: '#be123c' }}>已停用</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#a1a1aa' }}>
                    {isOwner
                      ? '全部店面'
                      : (u.store_ids ?? []).map((id: string) => storeMap[id]).filter(Boolean).join('、') || '未指派店家'
                    }
                  </p>
                </div>

                {canManageHQ && !isOwner && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <UserHQToggle userId={u.user_id} isHQ={u.is_hq ?? false} />
                    <span className="text-[10px]" style={{ color: '#a1a1aa' }}>總公司</span>
                  </div>
                )}

                {canManageHQ && (
                  <UserToggle userId={u.user_id} active={u.active} />
                )}
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
