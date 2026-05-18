import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import UserCreateDialog from '@/components/hq/user-create-dialog'
import UserToggle from '@/components/hq/user-toggle'
import UserHQToggle from '@/components/hq/user-hq-toggle'
import { Users, Building2 } from 'lucide-react'

const roleColors: Record<string, string> = {
  '老闆':  'bg-amber-100 text-amber-700',
  '總監':  'bg-purple-100 text-purple-700',
  '經理':  'bg-blue-100 text-blue-700',
  '顧問':  'bg-cyan-100 text-cyan-700',
  '店長':  'bg-green-100 text-green-700',
  '副店長': 'bg-emerald-100 text-emerald-700',
  '助理':  'bg-slate-100 text-slate-700',
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('user_id', user.id).single()

  if (!profile || !['經理', '總監', '老闆'].includes(profile.role)) {
    return <div className="p-6 text-red-500">權限不足，僅限經理以上查看</div>
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
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5" /> 帳號管理
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">共 {users?.length ?? 0} 個帳號</p>
        </div>
        <UserCreateDialog stores={stores ?? []} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {(users ?? []).map(u => {
              const isOwner = u.role === '老闆'
              return (
                <div key={u.user_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-900">{u.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                      {(isOwner || u.is_hq) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          <Building2 className="h-3 w-3" /> 總公司
                        </span>
                      )}
                      {!u.active && <Badge variant="destructive" className="text-xs">已停用</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {isOwner
                        ? '全部店面'
                        : (u.store_ids ?? []).map((id: string) => storeMap[id]).filter(Boolean).join('、') || '未指派店家'
                      }
                    </p>
                  </div>

                  {/* 總公司後台開關（老闆角色固定不能取消） */}
                  {canManageHQ && !isOwner && (
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <UserHQToggle userId={u.user_id} isHQ={u.is_hq ?? false} />
                      <span className="text-[10px] text-slate-400">總公司</span>
                    </div>
                  )}

                  {/* 帳號啟停（總監 / 老闆） */}
                  {canManageHQ && (
                    <UserToggle userId={u.user_id} active={u.active} />
                  )}
                </div>
              )
            })}
            {(!users || users.length === 0) && (
              <div className="py-12 text-center text-slate-400 text-sm">尚無帳號</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
