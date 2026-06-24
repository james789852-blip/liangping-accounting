import { cookies } from 'next/headers'
import { getCachedAllStores } from '@/lib/cached-queries'

// 老闆可查看所有店家（layout 從 DB 取全部 active 店），不限 store_ids
const BOSS_ROLES = ['老闆']
const HQ_ROLES = ['顧問', '經理', '總監']

export async function getEffectiveStoreId(profile: {
  role: string
  store_ids: string[]
  is_hq?: boolean
} | null): Promise<string | null> {
  if (!profile) return null

  const cookieStore = await cookies()
  const cookieStoreId = cookieStore.get('hq_viewing_store')?.value

  // 老闆 / is_hq：可查看所有 active 店家
  // 沒 cookie 時 fallback 第一家，保持與 manager/layout 一致
  if (BOSS_ROLES.includes(profile.role) || profile.is_hq) {
    if (cookieStoreId) return cookieStoreId
    const all = await getCachedAllStores()
    return (all as any[])[0]?.id ?? null
  }

  // 其他 HQ 角色（經理、總監等）：只能查看被指派的店
  if (HQ_ROLES.includes(profile.role)) {
    const allIds: string[] = profile.store_ids ?? []
    return (cookieStoreId && allIds.includes(cookieStoreId))
      ? cookieStoreId
      : allIds[0] ?? null
  }

  return profile.store_ids?.[0] ?? null
}
