'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface VendorItemTemplate {
  id: string
  item_name: string
  unit: string
  unit_price: number
}

export interface CategoryWithVendors {
  id: string
  name: string
  vendors: { id: string; name: string; item_templates: VendorItemTemplate[] }[]
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
      receipt_vendors(
        id, name, sort_order,
        vendor_item_templates(id, item_name, unit, unit_price, sort_order)
      )
    `)
    .eq('store_id', storeId)
    .order('sort_order')
    .order('created_at', { referencedTable: 'receipt_vendors' })
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    vendors: (c.receipt_vendors ?? []).map((v: any) => ({
      id: v.id,
      name: v.name,
      item_templates: (v.vendor_item_templates ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((t: any) => ({ id: t.id, item_name: t.item_name, unit: t.unit, unit_price: t.unit_price ?? 0 })),
    })),
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

export async function deleteVendor(vendorId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('receipt_vendors').delete().eq('id', vendorId)
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function addVendorItemTemplate(vendorId: string, itemName: string, unit: string, unitPrice: number) {
  await requireAuth()
  if (!itemName.trim()) return { error: '請輸入品項名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('vendor_item_templates').insert({
    vendor_id: vendorId,
    item_name: itemName.trim(),
    unit: unit.trim(),
    unit_price: unitPrice,
  })
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function updateVendorItemTemplate(templateId: string, itemName: string, unit: string, unitPrice: number) {
  await requireAuth()
  if (!itemName.trim()) return { error: '請輸入品項名稱' }
  const admin = createAdminClient()
  const { error } = await admin.from('vendor_item_templates')
    .update({ item_name: itemName.trim(), unit: unit.trim(), unit_price: unitPrice })
    .eq('id', templateId)
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}

export async function deleteVendorItemTemplate(templateId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('vendor_item_templates').delete().eq('id', templateId)
  if (error) return { error: error.message }
  revalidatePath('/manager/settings')
  return { success: true }
}
