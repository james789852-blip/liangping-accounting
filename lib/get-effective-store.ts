import { cookies } from 'next/headers'
import { getCachedAllStores } from '@/lib/cached-queries'
import { createClient } from '@/lib/supabase/server'

export async function getEffectiveStoreId(profile: {
  user_id?: string
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
  const accountStoreId = profile.user_id
    ? cookieStore.get(`last_viewing_store_${profile.user_id}`)?.value
    : undefined
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const savedStoreId = user?.user_metadata?.last_viewing_store_id as string | undefined
  const isBoss = profile.role === '老闆'
  const assignedIds = [...new Set(profile.store_ids ?? [])]
  const allStores = isBoss ? await getCachedAllStores() : []
  const allowedIds = isBoss ? allStores.map(store => store.id) : assignedIds
  const isAllowed = (storeId?: string | null): storeId is string =>
    !!storeId && allowedIds.includes(storeId)

  // 每一個 cookie 與主店值都必須再次通過目前帳號的店家權限清單。
  // 總公司身分本身不授予全部店家；只有老闆可以查看所有 active 店家。
  if (isAllowed(accountStoreId)) return accountStoreId
  if (isAllowed(savedStoreId)) return savedStoreId
  if (isAllowed(managerOverrideId)) return managerOverrideId
  if (isAllowed(profile.primary_store_id)) return profile.primary_store_id
  if (isAllowed(cookieStoreId)) return cookieStoreId
  return allowedIds[0] ?? null
}
