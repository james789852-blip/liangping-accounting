import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/authed-user'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import UserCreateDialog from '@/components/hq/user-create-dialog'
import UserEditDialog from '@/components/hq/user-edit-dialog'
import { Users, Building2, ChefHat, Store as StoreIcon } from 'lucide-react'
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

type UserProfile = Record<string, any> & {
  user_id: string
  name: string
  role: string
  store_ids?: string[]
  primary_store_id?: string | null
  is_hq?: boolean | null
  active?: boolean | null
}

function UserRow({ user, stores, storeMap, account }: {
  user: UserProfile
  stores: { id: string; name: string; type?: string }[]
  storeMap: Record<string, string>
  account: string
}) {
  const isOwner = user.role === '老闆'
  const displayTitle = user.title || user.role
  const roleSt = ROLE_STYLE[user.role] ?? { bg: '#f4f4f5', color: '#71717a' }
  const assignedNames = [...new Set((user.store_ids ?? []) as string[])].map(id => storeMap[id]).filter(Boolean)

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}>
        {(user.name || '?').slice(0, 1)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm" style={{ color: '#18181b' }}>{user.name}</span>
          {user.employee_id && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: '#f4f4f5', color: '#71717a' }}>
              {user.employee_id}
            </span>
          )}
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: roleSt.bg, color: roleSt.color }}>
            {displayTitle}
          </span>
          {(isOwner || user.is_hq) && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FEF3C7' }}>
              <Building2 className="h-3 w-3" /> 總公司
            </span>
          )}
          {!user.active && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: '#ffe4e6', color: '#be123c' }}>已停用</span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: '#a1a1aa' }}>
          {account && <span className="font-mono mr-2">{account}</span>}
          {isOwner || (stores.length > 0 && (user.store_ids ?? []).length >= stores.length)
            ? '全部店面'
            : assignedNames.join('、') || '未指派店家'}
        </p>
        {user.primary_store_id && storeMap[user.primary_store_id] && !isOwner && (
          <p className="text-[11px] mt-0.5" style={{ color: '#0369a1' }}>
            主店：<span className="font-semibold">{storeMap[user.primary_store_id]}</span>
          </p>
        )}
      </div>

      <UserEditDialog user={{ ...user, account }} stores={stores} />
    </div>
  )
}

function UserGroup({ name, type, users, stores, storeMap, accountMap }: {
  name: string
  type: 'store' | 'ck' | 'hq' | 'unassigned'
  users: UserProfile[]
  stores: { id: string; name: string; type?: string }[]
  storeMap: Record<string, string>
  accountMap: Record<string, string>
}) {
  const isCk = type === 'ck'
  const isHq = type === 'hq'
  const Icon = isHq ? Building2 : isCk ? ChefHat : StoreIcon
  const accent = isHq ? '#92400E' : isCk ? '#7c3aed' : '#047857'
  const tint = isHq ? '#FFFBEB' : isCk ? '#f3e8ff' : '#d1fae5'

  return (
    <section className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f4f4f5', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: tint, borderBottom: '1px solid #f4f4f5' }}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: accent }} />
          <h2 className="text-sm font-bold" style={{ color: '#18181b' }}>{name}</h2>
        </div>
        <span className="text-xs font-bold" style={{ color: accent }}>{users.length} 人</span>
      </div>
      <div className="divide-y" style={{ borderColor: '#f4f4f5' }}>
        {users.map(user => (
          <UserRow key={`${name}-${user.user_id}`} user={user} stores={stores} storeMap={storeMap} account={accountMap[user.user_id] ?? ''} />
        ))}
        {users.length === 0 && (
          <p className="px-4 py-5 text-center text-xs" style={{ color: '#a1a1aa' }}>目前沒有指派人員</p>
        )}
      </div>
    </section>
  )
}

export default async function UsersPage() {
  const supabase = await createClient()
  const user = await getAuthedUser()
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

  const allUsers = (users ?? []) as UserProfile[]
  const storeUsers = new Map<string, UserProfile[]>()
  const hqUsers: UserProfile[] = []
  const unassignedUsers: UserProfile[] = []

  for (const account of allUsers) {
    if (account.role === '老闆' || account.is_hq) {
      hqUsers.push(account)
      continue
    }
    const assignedIds = [...new Set((account.store_ids ?? []) as string[])].filter(id => storeMap[id])
    if (assignedIds.length === 0) {
      unassignedUsers.push(account)
      continue
    }
    for (const storeId of assignedIds) {
      const group = storeUsers.get(storeId) ?? []
      group.push(account)
      storeUsers.set(storeId, group)
    }
  }
  const storeSections = stores.filter(store => store.type !== '央廚')
  const ckSections = stores.filter(store => store.type === '央廚')

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

      <div className="max-w-3xl mx-auto px-4 py-5 pb-28 space-y-5">
        {hqUsers.length > 0 && (
          <UserGroup name="總公司管理人員" type="hq" users={hqUsers} stores={stores} storeMap={storeMap} accountMap={accountMap} />
        )}

        <div className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <div>
              <h2 className="text-base font-bold" style={{ color: '#18181b' }}>店面管理人員</h2>
              <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>依所屬店面分組；跨店帳號會出現在各所屬店面中</p>
            </div>
            <span className="text-xs font-semibold" style={{ color: '#047857' }}>{storeSections.length} 家店</span>
          </div>
          {storeSections.map(store => (
            <UserGroup key={store.id} name={store.name} type="store" users={storeUsers.get(store.id) ?? []} stores={stores} storeMap={storeMap} accountMap={accountMap} />
          ))}
        </div>

        {ckSections.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-end justify-between px-1">
              <div>
                <h2 className="text-base font-bold" style={{ color: '#18181b' }}>央廚管理人員</h2>
                <p className="text-xs mt-0.5" style={{ color: '#a1a1aa' }}>央廚帳號與所屬人員集中顯示</p>
              </div>
              <span className="text-xs font-semibold" style={{ color: '#7c3aed' }}>{ckSections.length} 座央廚</span>
            </div>
            {ckSections.map(store => (
              <UserGroup key={store.id} name={store.name} type="ck" users={storeUsers.get(store.id) ?? []} stores={stores} storeMap={storeMap} accountMap={accountMap} />
            ))}
          </div>
        )}

        {unassignedUsers.length > 0 && (
          <UserGroup name="未指派店面" type="unassigned" users={unassignedUsers} stores={stores} storeMap={storeMap} accountMap={accountMap} />
        )}

        {(users ?? []).length === 0 && (
          <div className="bg-white rounded-2xl py-12 text-center text-sm" style={{ color: '#a1a1aa', border: '1px solid #f4f4f5' }}>尚無帳號</div>
        )}
      </div>
    </div>
  )
}
