'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function revalidate() {
  revalidatePath('/manager/receipts')
  revalidatePath('/hq/item-mappings')
  revalidatePath('/hq/food-cost-preview')
}

export async function saveItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId?: string, vendorGroup?: string
) {
  const admin = createAdminClient()
  await admin.from('item_column_mappings').insert({
    item_name: itemName, excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup ?? null,
    store_id: storeId ?? null, updated_at: new Date().toISOString(),
  })
  revalidate()
  return { success: true }
}

export async function saveItemMappingsBatch(
  items: { item_name: string; excel_column: string; item_category: string }[],
  storeId?: string
) {
  if (!items.length) return { success: true }
  const admin = createAdminClient()
  await admin.from('item_column_mappings').insert(
    items.map(i => ({ ...i, store_id: storeId ?? null, updated_at: new Date().toISOString() }))
  )
  revalidate()
  return { success: true }
}

export async function deleteItemMapping(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '權限不足' }
  const admin = createAdminClient()
  await admin.from('item_column_mappings').delete().eq('id', id)
  revalidate()
  return { success: true }
}

export async function updateItemMapping(id: string, excelColumn: string, itemCategory: string, vendorGroup?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const admin = createAdminClient()
  await admin.from('item_column_mappings').update({
    excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup !== undefined ? (vendorGroup || null) : undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  revalidate()
  return { success: true }
}

export async function setItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId: string
) {
  const admin = createAdminClient()
  await admin.from('item_column_mappings').delete().eq('item_name', itemName).eq('store_id', storeId)
  await admin.from('item_column_mappings').insert({
    item_name: itemName, excel_column: excelColumn, item_category: itemCategory,
    store_id: storeId, updated_at: new Date().toISOString(),
  })
  revalidate()
  return { success: true }
}

export async function copyGlobalMappingsToStore(storeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const admin = createAdminClient()
  const { data: globals } = await admin
    .from('item_column_mappings').select('item_name, excel_column, item_category')
    .is('store_id', null)
  if (!globals?.length) return { error: '尚無全域對應可複製' }
  await admin.from('item_column_mappings').delete().eq('store_id', storeId)
  await admin.from('item_column_mappings').insert(
    globals.map(g => ({ ...g, store_id: storeId, updated_at: new Date().toISOString() }))
  )
  revalidate()
  return { success: true, count: globals.length }
}
