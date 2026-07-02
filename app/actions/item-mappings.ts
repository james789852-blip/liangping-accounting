'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'

function revalidate() {
  revalidatePath('/manager/receipts')
  revalidatePath('/hq/item-mappings')
  revalidatePath('/hq/food-cost-preview')
  // 失效 unstable_cache 的店家品項對應
  revalidateTag('item-mappings', 'default')
}

export async function saveItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId?: string, vendorGroup?: string
) {
  const admin = createAdminClient()

  // 1. 寫 item_column_mappings（原有邏輯 — 決定該品項對到 Excel 哪個欄名）
  await admin.from('item_column_mappings').insert({
    item_name: itemName, excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup ?? null,
    store_id: storeId ?? null, updated_at: new Date().toISOString(),
  })

  // 2. 確保 system_items + store_items 也有這品項（xlsx 匯出從這裡讀）
  //    否則新品項就算 mapping 有，xlsx 不會出現
  await ensureSystemItemAndEnable(itemName, itemCategory, vendorGroup, storeId)

  revalidate()
  return { success: true }
}

/** 確保品項在 system_items 存在，且該店的 store_items 啟用 */
async function ensureSystemItemAndEnable(
  itemName: string, itemCategory: string, vendorGroup?: string, storeId?: string,
) {
  const admin = createAdminClient()
  const catValid = (['食材', '耗材', '雜項'] as const).includes(itemCategory as any) ? itemCategory : '雜項'

  // 找 vendor_group_id（若 vendorGroup 有值）
  let vendorGroupId: string | null = null
  if (vendorGroup?.trim()) {
    const { data: vg } = await admin.from('system_vendor_groups')
      .select('id').eq('name', vendorGroup.trim()).eq('active', true).maybeSingle()
    if (vg) {
      vendorGroupId = vg.id
    } else {
      // 建新的 vendor group
      const { data: newVg } = await admin.from('system_vendor_groups').insert({
        name: vendorGroup.trim(), sort_order: 100, active: true,
      }).select('id').single()
      vendorGroupId = newVg?.id ?? null
    }
  }

  // 找/建 system_item
  let systemItemId: string | null = null
  const { data: existingSys } = await admin.from('system_items')
    .select('id').eq('name', itemName).eq('active', true).maybeSingle()
  if (existingSys) {
    systemItemId = existingSys.id
  } else {
    const { data: newSys } = await admin.from('system_items').insert({
      name: itemName, category: catValid,
      vendor_group_id: vendorGroupId,
      default_enabled: false, sort_order: 100, active: true,
    }).select('id').single()
    systemItemId = newSys?.id ?? null
  }

  // 若指定店家 → 啟用 store_items
  if (storeId && systemItemId) {
    const { data: existingStore } = await admin.from('store_items')
      .select('id, enabled')
      .eq('store_id', storeId).eq('system_item_id', systemItemId).maybeSingle()
    if (existingStore) {
      if (!existingStore.enabled) {
        await admin.from('store_items').update({ enabled: true }).eq('id', existingStore.id)
      }
    } else {
      await admin.from('store_items').insert({
        store_id: storeId, system_item_id: systemItemId, enabled: true, sort_order: 200,
      })
    }
  }
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

export async function reorderItemMappings(ids: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const admin = createAdminClient()
  await Promise.all(
    ids.map((id, i) => admin.from('item_column_mappings').update({ sort_order: (i + 1) * 10 }).eq('id', id))
  )
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
