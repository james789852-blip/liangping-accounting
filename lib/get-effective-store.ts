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

  // 優先順序：cookie（明確切換過） > primary_store_id（個人主店） > 後備

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

  // 店家角色（店長/副店長/廠長/副廠長）：主店優先
  if (profile.primary_store_id && (profile.store_ids ?? []).includes(profile.primary_store_id)) {
    return profile.primary_store_id
  }
  return profile.store_ids?.[0] ?? null
}
