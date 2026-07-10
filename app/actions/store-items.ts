'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { canManageItems } from '@/lib/user-permissions'

async function checkStoreAccess(storeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入', user: null }
  const { data: profile } = await supabase
    .from('user_profiles').select('*').eq('user_id', user.id).single()
  if (!profile) return { error: '找不到帳號', user: null }
  const isHQ = canManageItems(profile)
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
  // 不再 revalidatePath（client 用 optimistic state，下次重整自然會抓最新）
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

/** 重新排序店家品項 — 同 vendor_group 內的順序 */
export async function reorderStoreItems(
  storeId: string,
  items: { system_item_id?: string; store_item_id?: string }[],
) {
  const { error: authErr } = await checkStoreAccess(storeId)
  if (authErr) return { error: authErr }
  const admin = createAdminClient()

  // 平行處理：每個 item 對應 store_items 表的 row（system → 找 / 建；custom → 直接 update）
  await Promise.all(
    items.map(async (it, i) => {
      const sort_order = (i + 1) * 10
      if (it.store_item_id) {
        await admin.from('store_items')
          .update({ sort_order, updated_at: new Date().toISOString() })
          .eq('id', it.store_item_id)
      } else if (it.system_item_id) {
        const { data: existing } = await admin.from('store_items')
          .select('id')
          .eq('store_id', storeId)
          .eq('system_item_id', it.system_item_id)
          .maybeSingle()
        if (existing) {
          await admin.from('store_items')
            .update({ sort_order, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await admin.from('store_items')
            .insert({ store_id: storeId, system_item_id: it.system_item_id, enabled: false, sort_order })
        }
      }
    })
  )
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
