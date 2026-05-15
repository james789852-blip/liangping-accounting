import { cookies } from 'next/headers'

const HQ_ROLES = ['顧問', '經理', '總監']

export async function getEffectiveStoreId(profile: {
  role: string
  store_ids: string[]
} | null): Promise<string | null> {
  if (!profile) return null

  if (HQ_ROLES.includes(profile.role)) {
    const cookieStore = await cookies()
    const cookieStoreId = cookieStore.get('hq_viewing_store')?.value
    const allIds: string[] = profile.store_ids ?? []
    return (cookieStoreId && allIds.includes(cookieStoreId))
      ? cookieStoreId
      : allIds[0] ?? null
  }

  return profile.store_ids?.[0] ?? null
}
