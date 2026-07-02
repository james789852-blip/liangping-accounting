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

  // 先撈 mapping 資料，用來反查 system_item + store_item
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('item_name, store_id').eq('id', id).maybeSingle()

  await admin.from('item_column_mappings').delete().eq('id', id)

  // 若 mapping 綁定特定店家 → 同步 disable 該店的 store_item（否則 xlsx 匯出還會有這欄）
  if (mapping?.store_id && mapping?.item_name) {
    const { data: sys } = await admin.from('system_items')
      .select('id').eq('name', mapping.item_name).eq('active', true).maybeSingle()
    if (sys) {
      await admin.from('store_items')
        .update({ enabled: false })
        .eq('store_id', mapping.store_id)
        .eq('system_item_id', sys.id)
    }
  }

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

  // 1. 更新 item_column_mappings.sort_order（UI 排序）
  await Promise.all(
    ids.map((id, i) => admin.from('item_column_mappings').update({ sort_order: (i + 1) * 10 }).eq('id', id))
  )

  // 2. 同步 system_items / store_items 的 sort_order（xlsx 匯出依這個排）
  const { data: mappings } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id').in('id', ids)
  if (mappings?.length) {
    // 撈所有涉及的 system_items
    const names = mappings.map(m => m.item_name)
    const { data: sys } = await admin.from('system_items')
      .select('id, name').in('name', names).eq('active', true)
    const sysIdByName = new Map((sys ?? []).map((s: any) => [s.name, s.id]))

    await Promise.all(ids.map(async (id, i) => {
      const m = mappings.find(x => x.id === id)
      if (!m) return
      const order = (i + 1) * 10
      const sysId = sysIdByName.get(m.item_name)
      if (!sysId) return
      if (m.store_id) {
        // 該店 store_item.sort_order（優先）
        await admin.from('store_items')
          .update({ sort_order: order })
          .eq('store_id', m.store_id)
          .eq('system_item_id', sysId)
      } else {
        // 全域 mapping → 更新 system_items.sort_order
        await admin.from('system_items').update({ sort_order: order }).eq('id', sysId)
      }
    }))
  }

  revalidate()
  return { success: true }
}

/**
 * 設定「品項層級 doc_type override」
 * 若指定 storeId → 存到 store_items.doc_type_override（該店專屬）
 * 若沒 storeId → 存到 system_items.doc_type_override（全域）
 */
export async function setItemDocOverride(itemName: string, storeId: string | null, docOverride: string | null) {
  const admin = createAdminClient()
  const { data: sys } = await admin.from('system_items')
    .select('id').eq('name', itemName).eq('active', true).maybeSingle()
  if (!sys) return { error: '找不到 system_item' }
  if (storeId) {
    const { data: existing } = await admin.from('store_items')
      .select('id').eq('store_id', storeId).eq('system_item_id', sys.id).maybeSingle()
    if (existing) {
      await admin.from('store_items').update({
        doc_type_override: docOverride || null, updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await admin.from('store_items').insert({
        store_id: storeId, system_item_id: sys.id, enabled: true,
        doc_type_override: docOverride || null, sort_order: 200,
      })
    }
  } else {
    await admin.from('system_items').update({
      doc_type_override: docOverride || null, updated_at: new Date().toISOString(),
    }).eq('id', sys.id)
  }
  revalidate()
  return { success: true as const }
}

/** 修改廠商群組名稱（同步更新 system_vendor_groups + item_column_mappings） */
export async function renameVendorGroup(oldName: string, newName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '權限不足' }
  const trimmed = newName.trim()
  if (!trimmed) return { error: '名稱不能空' }
  if (trimmed === oldName) return { success: true as const }

  const admin = createAdminClient()
  // 檢查新名字有沒重複
  const { data: dup } = await admin.from('system_vendor_groups').select('id').eq('name', trimmed).eq('active', true).maybeSingle()
  if (dup) return { error: `已有廠商群組叫「${trimmed}」` }

  await admin.from('system_vendor_groups').update({ name: trimmed, updated_at: new Date().toISOString() }).eq('name', oldName)
  await admin.from('item_column_mappings').update({ vendor_group: trimmed, updated_at: new Date().toISOString() }).eq('vendor_group', oldName)

  revalidate()
  return { success: true as const }
}

/**
 * 移除整個廠商群組（含底下所有 mappings + store_items disable + system_vendor_group deactivate）
 * @param vgName - vendor_group 名稱
 * @param storeId - 若有 → 只刪該店 mappings；若沒 → 也 deactivate 全域 vg
 */
export async function deleteVendorGroupWithItems(vgName: string, storeId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '權限不足' }

  const admin = createAdminClient()

  // 1. 找 vg 底下的 mappings
  let mapQuery = admin.from('item_column_mappings').select('id, item_name, store_id').eq('vendor_group', vgName)
  if (storeId) mapQuery = mapQuery.eq('store_id', storeId)
  const { data: mappings } = await mapQuery
  const itemNames = [...new Set((mappings ?? []).map((m: any) => m.item_name as string))]

  // 2. 刪除 mappings
  if (mappings && mappings.length > 0) {
    await admin.from('item_column_mappings').delete().in('id', mappings.map((m: any) => m.id))
  }

  // 3. Disable 對應 store_items
  if (itemNames.length > 0) {
    const { data: sys } = await admin.from('system_items').select('id, name').in('name', itemNames).eq('active', true)
    const sysIds = (sys ?? []).map((s: any) => s.id)
    if (sysIds.length > 0) {
      let siQuery = admin.from('store_items').update({ enabled: false }).in('system_item_id', sysIds)
      if (storeId) siQuery = siQuery.eq('store_id', storeId)
      await siQuery
    }
  }

  // 4. 若沒指定 store（全域刪除）→ deactivate system_vendor_group
  if (!storeId) {
    await admin.from('system_vendor_groups').update({ active: false }).eq('name', vgName)
  }

  revalidate()
  return { success: true as const, mappingsRemoved: mappings?.length ?? 0, itemsAffected: itemNames.length }
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
