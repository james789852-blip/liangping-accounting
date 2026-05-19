import { cookies } from 'next/headers'

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

  // 老闆：直接信任 cookie（不受 store_ids 限制）
  if (BOSS_ROLES.includes(profile.role) || profile.is_hq) {
    return cookieStoreId ?? null
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
