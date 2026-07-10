'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { canManageCKReceipts, canManageStoreReceipts } from '@/lib/user-permissions'

/** 精準 revalidate 只清跟收據設定相關的頁面（不 nuke 整站） */
function revalidateReceipt() {
  revalidatePath('/manager/settings')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/edit', 'layout')
  revalidatePath('/hq/receipt-settings')
}

export interface CategoryWithVendors {
  id: string
  name: string
  vendors: { id: string; name: string }[]
}

async function requireAuth(storeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登入')
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  const admin = createAdminClient()
  const { data: store } = await admin.from('stores').select('type').eq('id', storeId).single()
  const isCK = store?.type === '央廚'
  if (isCK ? !canManageCKReceipts(profile) : !canManageStoreReceipts(profile)) {
    throw new Error(isCK ? '權限不足，未開啟「可管理央廚收據廠商」權限' : '權限不足，未開啟「可管理店面收據廠商」權限')
  }
  return user
}

async function storeIdByCategory(categoryId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('receipt_categories').select('store_id').eq('id', categoryId).single()
  return data?.store_id as string | undefined
}

async function storeIdByVendor(vendorId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('receipt_vendors').select('store_id').eq('id', vendorId).single()
  return data?.store_id as string | undefined
}

export async function getReceiptSettings(storeId: string): Promise<CategoryWithVendors[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('receipt_categories')
    .select(`
      id, name, sort_order,
      receipt_vendors(id, name, sort_order, created_at)
    `)
    .eq('store_id', storeId)
    .order('sort_order')
  // 廠商按 sort_order 排（NULL 排最後 fallback 到 created_at）
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    vendors: (c.receipt_vendors ?? [])
      .sort((a: any, b: any) => {
        const sa = a.sort_order ?? 999999
        const sb = b.sort_order ?? 999999
        if (sa !== sb) return sa - sb
        return (a.created_at ?? '').localeCompare(b.created_at ?? '')
      })
      .map((v: any) => ({ id: v.id, name: v.name })),
  }))
}

async function nextCatSort(storeId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('receipt_categories').select('sort_order').eq('store_id', storeId)
  return Math.max(0, ...(data ?? []).map((r: any) => r.sort_order ?? 0)) + 10
}
async function nextVendorSort(categoryId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('receipt_vendors').select('sort_order').eq('category_id', categoryId)
  return Math.max(0, ...(data ?? []).map((r: any) => r.sort_order ?? 0)) + 10
}

export async function addCategory(storeId: string, name: string) {
  await requireAuth(storeId)
  if (!name.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const sortOrder = await nextCatSort(storeId)
  const { error } = await admin.from('receipt_categories').insert({ store_id: storeId, name: name.trim(), sort_order: sortOrder })
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  revalidateReceipt()
  return { success: true }
}

export async function addCategoryWithVendors(storeId: string, categoryName: string, vendorNames: string[]) {
  await requireAuth(storeId)
  if (!categoryName.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const sortOrder = await nextCatSort(storeId)
  const { data: cat, error } = await admin
    .from('receipt_categories')
    .insert({ store_id: storeId, name: categoryName.trim(), sort_order: sortOrder })
    .select('id').single()
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  const valid = vendorNames.map(v => v.trim()).filter(Boolean)
  if (valid.length > 0) {
    await admin.from('receipt_vendors').insert(
      valid.map((name, i) => ({ store_id: storeId, category_id: cat.id, name, sort_order: (i + 1) * 10 }))
    )
  }
  revalidateReceipt()
  return { success: true }
}

export async function updateCategoryName(categoryId: string, name: string) {
  const storeId = await storeIdByCategory(categoryId)
  if (!storeId) return { error: '找不到類別' }
  await requireAuth(storeId)
  if (!name.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_categories').update({ name: name.trim() }).eq('id', categoryId)
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  revalidateReceipt()
  return { success: true }
}

export async function deleteCategory(categoryId: string) {
  const storeId = await storeIdByCategory(categoryId)
  if (!storeId) return { error: '找不到類別' }
  await requireAuth(storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_categories').delete().eq('id', categoryId)
  if (error) return { error: error.message }
  revalidateReceipt()
  return { success: true }
}

export async function addVendor(storeId: string, categoryId: string, name: string) {
  await requireAuth(storeId)
  if (!name.trim()) return { error: '請輸入廠商名稱' }
  const admin = createAdminClient()
  const sortOrder = await nextVendorSort(categoryId)
  const { error } = await admin.from('receipt_vendors').insert({ store_id: storeId, category_id: categoryId, name: name.trim(), sort_order: sortOrder })
  if (error) return { error: error.code === '23505' ? '廠商已存在' : error.message }
  revalidateReceipt()
  return { success: true }
}

export async function updateVendor(vendorId: string, name: string) {
  const storeId = await storeIdByVendor(vendorId)
  if (!storeId) return { error: '找不到廠商' }
  await requireAuth(storeId)
  if (!name.trim()) return { error: '請輸入廠商名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').update({ name: name.trim() }).eq('id', vendorId)
  if (error) return { error: error.code === '23505' ? '廠商已存在' : error.message }
  revalidateReceipt()
  return { success: true }
}

export async function deleteVendor(vendorId: string) {
  const storeId = await storeIdByVendor(vendorId)
  if (!storeId) return { error: '找不到廠商' }
  await requireAuth(storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').delete().eq('id', vendorId)
  if (error) return { error: error.message }
  revalidateReceipt()
  return { success: true }
}

/** 重新排序類別（依傳入 ids 順序賦 sort_order） */
export async function reorderCategories(ids: string[]) {
  if (ids.length === 0) return { success: true }
  const firstStoreId = ids[0] ? await storeIdByCategory(ids[0]) : undefined
  if (!firstStoreId) return { error: '找不到類別' }
  await requireAuth(firstStoreId)
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await admin.from('receipt_categories').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
  }
  revalidateReceipt()
  return { success: true }
}

/** 重新排序類別內廠商 */
export async function reorderVendors(ids: string[]) {
  if (ids.length === 0) return { success: true }
  const firstStoreId = ids[0] ? await storeIdByVendor(ids[0]) : undefined
  if (!firstStoreId) return { error: '找不到廠商' }
  await requireAuth(firstStoreId)
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await admin.from('receipt_vendors').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
  }
  revalidateReceipt()
  return { success: true }
}
