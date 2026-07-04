'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CategoryWithVendors {
  id: string
  name: string
  vendors: { id: string; name: string }[]
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登入')
  return user
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

export async function addCategory(storeId: string, name: string) {
  await requireAuth()
  if (!name.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_categories').insert({ store_id: storeId, name: name.trim() })
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function addCategoryWithVendors(storeId: string, categoryName: string, vendorNames: string[]) {
  await requireAuth()
  if (!categoryName.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const { data: cat, error } = await admin
    .from('receipt_categories')
    .insert({ store_id: storeId, name: categoryName.trim() })
    .select('id').single()
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  const valid = vendorNames.map(v => v.trim()).filter(Boolean)
  if (valid.length > 0) {
    await admin.from('receipt_vendors').insert(
      valid.map(name => ({ store_id: storeId, category_id: cat.id, name }))
    )
  }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function updateCategoryName(categoryId: string, name: string) {
  await requireAuth()
  if (!name.trim()) return { error: '請輸入類別名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_categories').update({ name: name.trim() }).eq('id', categoryId)
  if (error) return { error: error.code === '23505' ? '類別已存在' : error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function deleteCategory(categoryId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_categories').delete().eq('id', categoryId)
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function addVendor(storeId: string, categoryId: string, name: string) {
  await requireAuth()
  if (!name.trim()) return { error: '請輸入廠商名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').insert({ store_id: storeId, category_id: categoryId, name: name.trim() })
  if (error) return { error: error.code === '23505' ? '廠商已存在' : error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function updateVendor(vendorId: string, name: string) {
  await requireAuth()
  if (!name.trim()) return { error: '請輸入廠商名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').update({ name: name.trim() }).eq('id', vendorId)
  if (error) return { error: error.code === '23505' ? '廠商已存在' : error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function deleteVendor(vendorId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').delete().eq('id', vendorId)
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

/** 重新排序類別（依傳入 ids 順序賦 sort_order） */
export async function reorderCategories(ids: string[]) {
  await requireAuth()
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await admin.from('receipt_categories').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
  }
  revalidatePath('/manager/settings')
  revalidatePath('/hq/receipt-settings')
  return { success: true }
}

/** 重新排序類別內廠商 */
export async function reorderVendors(ids: string[]) {
  await requireAuth()
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await admin.from('receipt_vendors').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
  }
  revalidatePath('/manager/settings')
  revalidatePath('/hq/receipt-settings')
  return { success: true }
}

