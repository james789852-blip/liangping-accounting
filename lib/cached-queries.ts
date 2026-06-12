import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'

export const getCachedUserProfile = unstable_cache(
  async (userId: string) => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('user_profiles')
      .select('name, role, store_ids, is_hq')
      .eq('user_id', userId)
      .single()
    return data
  },
  ['user-profile'],
  { revalidate: 60, tags: ['user-profile'] }
)

export const getCachedAllStores = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('stores')
      .select('id, name, type')
      .eq('active', true)
      .order('name')
    return data ?? []
  },
  ['all-stores'],
  { revalidate: 60, tags: ['stores'] }
)

export const getCachedStoreById = unstable_cache(
  async (storeId: string) => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('stores')
      .select('id, name, type')
      .eq('id', storeId)
      .single()
    return data
  },
  ['store-by-id'],
  { revalidate: 60, tags: ['stores'] }
)
