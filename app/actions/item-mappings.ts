'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveItemMapping(itemName: string, excelColumn: string, itemCategory: string) {
  const admin = createAdminClient()
  await admin.from('item_column_mappings').upsert(
    { item_name: itemName, excel_column: excelColumn, item_category: itemCategory, updated_at: new Date().toISOString() },
    { onConflict: 'item_name' }
  )
  revalidatePath('/manager/receipts')
  revalidatePath('/hq/item-mappings')
  return { success: true }
}

export async function saveItemMappingsBatch(
  items: { item_name: string; excel_column: string; item_category: string }[]
) {
  if (!items.length) return { success: true }
  const admin = createAdminClient()
  await admin.from('item_column_mappings').upsert(
    items.map(i => ({ ...i, updated_at: new Date().toISOString() })),
    { onConflict: 'item_name' }
  )
  revalidatePath('/manager/receipts')
  revalidatePath('/hq/item-mappings')
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
  revalidatePath('/hq/item-mappings')
  return { success: true }
}

export async function updateItemMapping(
  id: string, excelColumn: string, itemCategory: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const admin = createAdminClient()
  await admin.from('item_column_mappings').update({
    excel_column: excelColumn, item_category: itemCategory, updated_at: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/hq/item-mappings')
  return { success: true }
}
