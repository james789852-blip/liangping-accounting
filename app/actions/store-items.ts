'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function checkStoreAccess(storeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入', user: null }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq, store_ids').eq('user_id', user.id).single()
  if (!profile) return { error: '找不到帳號', user: null }
  const isHQ = profile.is_hq || ['老闆', '經理', '總監'].includes(profile.role ?? '')
  if (!isHQ) {
    const storeIds = (profile.store_ids as string[]) ?? []
    if (!storeIds.includes(storeId)) return { error: '無權限管理此店家', user: null }
  }
  return { error: null, user }
}

/** 啟用一個系統品項（建立 store_items 或開啟既有） */
export async function enableSystemItem(storeId: string, systemItemId: string) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  // upsert (store_id, system_item_id) enabled=true
  const { data: existing } = await admin.from('store_items')
    .select('id').eq('store_id', storeId).eq('system_item_id', systemItemId).maybeSingle()
  if (existing) {
    await admin.from('store_items').update({ enabled: true, updated_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await admin.from('store_items').insert({ store_id: storeId, system_item_id: systemItemId, enabled: true })
  }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true }
}

/** 停用 */
export async function disableSystemItem(storeId: string, systemItemId: string) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const { data: existing } = await admin.from('store_items')
    .select('id').eq('store_id', storeId).eq('system_item_id', systemItemId).maybeSingle()
  if (existing) {
    await admin.from('store_items').update({ enabled: false, updated_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await admin.from('store_items').insert({ store_id: storeId, system_item_id: systemItemId, enabled: false })
  }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true }
}

/** 新增店家自訂品項 */
export async function addCustomItem(storeId: string, input: { name: string; category: string; vendor_group_id: string | null }) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  if (!input.name?.trim()) return { error: '請填寫品項名稱' }
  if (!['食材', '耗材', '雜項'].includes(input.category)) return { error: '類別不正確' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('store_items').insert({
    store_id: storeId,
    custom_name: input.name.trim(),
    custom_category: input.category,
    custom_vendor_group_id: input.vendor_group_id,
    enabled: true,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true, id: data.id }
}

export async function updateCustomItem(id: string, storeId: string, patch: { name?: string; category?: string; vendor_group_id?: string | null }) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const cleanPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) cleanPatch.custom_name = patch.name.trim()
  if (patch.category !== undefined) cleanPatch.custom_category = patch.category
  if (patch.vendor_group_id !== undefined) cleanPatch.custom_vendor_group_id = patch.vendor_group_id
  const { error } = await admin.from('store_items').update(cleanPatch).eq('id', id).eq('store_id', storeId)
  if (error) return { error: error.message }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true }
}

export async function deleteCustomItem(id: string, storeId: string) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const { error } = await admin.from('store_items').delete().eq('id', id).eq('store_id', storeId)
  if (error) return { error: error.message }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true }
}

/** 一鍵套用「預設啟用」全部 */
export async function applyAllDefaults(storeId: string) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()
  const { data: defaults } = await admin.from('system_items')
    .select('id').eq('active', true).eq('default_enabled', true)
  const { data: existing } = await admin.from('store_items')
    .select('system_item_id').eq('store_id', storeId).not('system_item_id', 'is', null)
  const existingSet = new Set((existing ?? []).map((e: any) => e.system_item_id))
  const toInsert = (defaults ?? [])
    .filter((d: any) => !existingSet.has(d.id))
    .map((d: any) => ({ store_id: storeId, system_item_id: d.id, enabled: true }))
  if (toInsert.length > 0) {
    await admin.from('store_items').insert(toInsert)
  }
  revalidatePath('/hq/store-items')
  revalidatePath('/manager/items')
  return { success: true, added: toInsert.length }
}
