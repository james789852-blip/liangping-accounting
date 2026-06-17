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

// 結帳表單需要 stores 完整欄位（uber_accounts、ichef_uber_linked、mode、petty_cash 等）
export const getCachedStoreFull = unstable_cache(
  async (storeId: string) => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single()
    return data
  },
  ['store-full'],
  { revalidate: 60, tags: ['stores'] }
)

// 央廚單價（很少變動）
export const getCachedActiveCKPrices = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('central_kitchen_prices')
      .select('id, item_name, unit_price, unit, excel_column')
      .eq('active', true)
      .order('sort_order').order('item_name')
    return data ?? []
  },
  ['active-ck-prices'],
  { revalidate: 300, tags: ['ck-prices'] }
)

// 店家品項對應（更新時應該 revalidateTag('item-mappings')）
export const getCachedStoreMappings = unstable_cache(
  async (storeId: string) => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('item_column_mappings')
      .select('item_name, item_category, vendor_group, excel_column')
      .eq('store_id', storeId)
    return data ?? []
  },
  ['store-mappings'],
  { revalidate: 300, tags: ['item-mappings'] }
)

// 店家 Excel 模板的品項順序（上傳模板時應該 revalidateTag('item-order')）
export const getCachedItemOrder = unstable_cache(
  async (storeId: string): Promise<string[]> => {
    const admin = createAdminClient()
    try {
      const { data } = await admin.storage.from('excel-templates').download(`${storeId}-item-order.json`)
      if (!data) return []
      const text = await data.text()
      return JSON.parse(text) ?? []
    } catch {
      return []
    }
  },
  ['item-order'],
  { revalidate: 600, tags: ['item-order'] }
)
