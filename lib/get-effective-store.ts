import { cookies } from 'next/headers'
import { getCachedAllStores } from '@/lib/cached-queries'

// 老闆可查看所有店家（layout 從 DB 取全部 active 店），不限 store_ids
const BOSS_ROLES = ['老闆']
const HQ_ROLES = ['顧問', '經理', '總監']

export async function getEffectiveStoreId(profile: {
  role: string
  store_ids: string[]
  is_hq?: boolean
  primary_store_id?: string | null
} | null): Promise<string | null> {
  if (!profile) return null

  const cookieStore = await cookies()
  const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
  // 店面端的切店是明確的使用者操作，使用獨立 cookie，避免沿用總公司端
  // 過期的切店狀態；沒有手動切換時才回到帳號設定的主店。
  const managerOverrideId = cookieStore.get('manager_viewing_store')?.value

  // 有主店的總公司人員也可在店長端切換被授權的店家；沒有手動切換時才回主店。
  if (managerOverrideId && (profile.store_ids ?? []).includes(managerOverrideId)) return managerOverrideId

  // 店家角色進入店長端時預設以個人主店為主；只有使用者在店長端
  // 明確選擇其他授權店家時，才使用 manager_viewing_store。
  const isStoreRole = ['店長', '副店長', '小幫手', '廠長', '副廠長'].includes(profile.role)
  if (isStoreRole) {
    if (profile.primary_store_id && (profile.store_ids ?? []).includes(profile.primary_store_id)) {
      return profile.primary_store_id
    }
    return profile.store_ids?.[0] ?? null
  }

  // 總公司角色若有設定主店，也以主店為主；只有沒有主店時才沿用總公司切店狀態。
  if (profile.primary_store_id) return profile.primary_store_id

  // 其他管理角色：優先沿用明確切換的店家，再使用個人主店作為預設。

  // 老闆 / is_hq：可查看所有 active 店家
  if (BOSS_ROLES.includes(profile.role) || profile.is_hq) {
    if (cookieStoreId) return cookieStoreId
    if (profile.primary_store_id) return profile.primary_store_id
    const all = await getCachedAllStores()
    return (all as any[])[0]?.id ?? null
  }

  // 其他 HQ 角色（經理、總監、顧問）：只能查看被指派的店
  if (HQ_ROLES.includes(profile.role)) {
    const allIds: string[] = profile.store_ids ?? []
    if (cookieStoreId && allIds.includes(cookieStoreId)) return cookieStoreId
    if (profile.primary_store_id && allIds.includes(profile.primary_store_id)) {
      return profile.primary_store_id
    }
    return allIds[0] ?? null
  }

  return profile.store_ids?.[0] ?? null
}
