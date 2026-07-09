'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { syncMiscVendorsFromMappingChange } from '@/lib/misc-sync'

// 用 defer 執行 sync：response 送回 client 後才跑，不阻塞使用者
function deferSyncMisc(storeId: string | null | undefined) {
  after(async () => {
    try { await syncMiscVendorsFromMappingChange(storeId) }
    catch (e) { console.warn('[misc-sync] defer failed:', e) }
  })
}

function revalidate() {
  revalidatePath('/manager/receipts')
  revalidatePath('/manager/closing')
  revalidatePath('/manager/settings')
  revalidatePath('/manager/edit', 'layout')
  revalidatePath('/hq/item-mappings')
  revalidatePath('/hq/receipt-settings')
  revalidatePath('/hq/food-cost-preview')
  revalidateTag('item-mappings', 'default')
}

// 單據類型異動只需刷新品項管理頁，不需觸及店長端
function revalidateLight() {
  revalidatePath('/hq/item-mappings')
  revalidateTag('item-mappings', 'default')
}

export async function saveItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId?: string, vendorGroup?: string
) {
  const admin = createAdminClient()

  // 檢查是否已存在（避免 unique constraint 錯誤）
  let query = admin.from('item_column_mappings').select('id').eq('item_name', itemName)
  if (storeId) query = query.eq('store_id', storeId)
  else query = query.is('store_id', null)
  const { data: existing } = await query.maybeSingle()
  if (existing) return { error: `品項「${itemName}」已存在對應` }

  // 1. 寫 item_column_mappings
  //    sort_order 排到該 vg 內現有最大值 +10 → 新品項永遠在該分類最下方
  let peerQuery = admin.from('item_column_mappings').select('sort_order, vg_sort_order')
  peerQuery = storeId ? peerQuery.eq('store_id', storeId) : peerQuery.is('store_id', null)
  peerQuery = vendorGroup ? peerQuery.eq('vendor_group', vendorGroup) : peerQuery.is('vendor_group', null)
  const { data: peers } = await peerQuery
  const maxSort = Math.max(0, ...(peers ?? []).map((p: any) => p.sort_order ?? 0))
  const newSort = maxSort + 10

  // 每店獨立：vg_sort_order（類別排序）繼承該店該類別現有品項的值（同類別須一致）；
  //           若是全新類別，排到該店所有類別的最後。
  let vgSort: number
  const existingVgSort = (peers ?? []).map((p: any) => p.vg_sort_order).find((v: any) => v != null)
  if (existingVgSort != null) {
    vgSort = existingVgSort
  } else {
    let allVgQuery = admin.from('item_column_mappings').select('vg_sort_order')
    allVgQuery = storeId ? allVgQuery.eq('store_id', storeId) : allVgQuery.is('store_id', null)
    const { data: allVg } = await allVgQuery
    vgSort = Math.max(0, ...(allVg ?? []).map((v: any) => v.vg_sort_order ?? 0)) + 10
  }

  const { error: insertErr } = await admin.from('item_column_mappings').insert({
    item_name: itemName, excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup ?? null,
    store_id: storeId ?? null, sort_order: newSort, vg_sort_order: vgSort,
    updated_at: new Date().toISOString(),
  })
  if (insertErr) return { error: `新增失敗：${insertErr.message}` }

  // 2. 確保 system_items + store_items 也有這品項
  const ensured = await ensureSystemItemAndEnable(itemName, itemCategory, vendorGroup, storeId)

  // 3. 若品項屬「未分類/雜項」→ 同步到收據雜項下拉
  if (!vendorGroup || vendorGroup === '雜項' || vendorGroup === '未分類') {
    deferSyncMisc(storeId ?? null)
  }

  revalidate()
  return { success: true as const, newVg: ensured.newlyCreatedVg }
}

/** 確保品項在 system_items 存在，且該店的 store_items 啟用 */
async function ensureSystemItemAndEnable(
  itemName: string, itemCategory: string, vendorGroup?: string, storeId?: string,
): Promise<{ newlyCreatedVg: { id: string; name: string; sort_order: number } | null }> {
  const admin = createAdminClient()
  const catValid = (['食材', '耗材', '雜項'] as const).includes(itemCategory as any) ? itemCategory : '雜項'

  // 找 vendor_group_id（若 vendorGroup 有值）
  let vendorGroupId: string | null = null
  let newlyCreatedVg: { id: string; name: string; sort_order: number } | null = null
  if (vendorGroup?.trim()) {
    const { data: vg } = await admin.from('system_vendor_groups')
      .select('id').eq('name', vendorGroup.trim()).eq('active', true).maybeSingle()
    if (vg) {
      vendorGroupId = vg.id
    } else {
      // 建新的 vendor group（sort_order 排到現有最大值 +10）
      const { data: allVgs } = await admin.from('system_vendor_groups')
        .select('sort_order').eq('active', true)
      const maxSort = Math.max(0, ...(allVgs ?? []).map((v: any) => v.sort_order ?? 0))
      const newSort = maxSort + 10
      const { data: newVg } = await admin.from('system_vendor_groups').insert({
        name: vendorGroup.trim(), kind: 'vendor', sort_order: newSort, active: true,
      }).select('id, sort_order').single()
      vendorGroupId = newVg?.id ?? null
      if (newVg?.id) newlyCreatedVg = { id: newVg.id, name: vendorGroup.trim(), sort_order: newVg.sort_order ?? newSort }
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

  // 若指定店家 → 啟用 store_items + 同步 custom_vendor_group_id
  if (storeId && systemItemId) {
    const { data: existingStore } = await admin.from('store_items')
      .select('id, enabled')
      .eq('store_id', storeId).eq('system_item_id', systemItemId).maybeSingle()
    if (existingStore) {
      const patch: any = { enabled: true }
      if (vendorGroupId) patch.custom_vendor_group_id = vendorGroupId
      await admin.from('store_items').update(patch).eq('id', existingStore.id)
    } else {
      await admin.from('store_items').insert({
        store_id: storeId, system_item_id: systemItemId, enabled: true, sort_order: 200,
        custom_vendor_group_id: vendorGroupId,
      })
    }
  }
  return { newlyCreatedVg }
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
    .select('item_name, store_id, vendor_group').eq('id', id).maybeSingle()

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

  // 若原本屬「未分類/雜項」→ 同步移除收據雜項下拉
  const oldVg = mapping?.vendor_group
  if (!oldVg || oldVg === '雜項' || oldVg === '未分類') {
    deferSyncMisc(mapping?.store_id ?? null)
  }

  revalidate()
  return { success: true }
}

export async function updateItemMapping(id: string, excelColumn: string, itemCategory: string, vendorGroup?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const admin = createAdminClient()

  // 撈原 mapping 拿 item_name + store_id + 舊 vg
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('item_name, store_id, vendor_group').eq('id', id).maybeSingle()
  const oldVg = mapping?.vendor_group ?? null
  const newVg = vendorGroup !== undefined ? (vendorGroup || null) : oldVg

  await admin.from('item_column_mappings').update({
    excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup !== undefined ? (vendorGroup || null) : undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // 同步 store_items.custom_vendor_group_id（xlsx 匯出讀這個）
  if (mapping?.store_id && mapping.item_name && vendorGroup !== undefined) {
    let vgId: string | null = null
    if (vendorGroup?.trim()) {
      const { data: vg } = await admin.from('system_vendor_groups')
        .select('id').eq('name', vendorGroup.trim()).eq('active', true).maybeSingle()
      vgId = vg?.id ?? null
    }
    const { data: sys } = await admin.from('system_items')
      .select('id').eq('name', mapping.item_name).eq('active', true).maybeSingle()
    if (sys) {
      await admin.from('store_items')
        .update({ custom_vendor_group_id: vgId })
        .eq('store_id', mapping.store_id)
        .eq('system_item_id', sys.id)
    }
  }

  // 若 vg 涉及「未分類/雜項」（進或出）→ 同步收據雜項下拉
  const wasMisc = !oldVg || oldVg === '雜項' || oldVg === '未分類'
  const isMisc = !newVg || newVg === '雜項' || newVg === '未分類'
  if (wasMisc || isMisc) {
    deferSyncMisc(mapping?.store_id ?? null)
  }

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

/** 批次刪除品項 */
export async function batchDeleteItemMappings(ids: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '權限不足' }
  if (ids.length === 0) return { success: true as const, deleted: 0 }
  const admin = createAdminClient()

  // 撈全部 mappings 資料
  const { data: mappings } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group').in('id', ids)

  await admin.from('item_column_mappings').delete().in('id', ids)

  // 同步 disable 店家專屬 store_items
  for (const m of mappings ?? []) {
    if (!m.store_id || !m.item_name) continue
    const { data: sys } = await admin.from('system_items')
      .select('id').eq('name', m.item_name).eq('active', true).maybeSingle()
    if (sys) {
      await admin.from('store_items')
        .update({ enabled: false })
        .eq('store_id', m.store_id)
        .eq('system_item_id', sys.id)
    }
  }

  // 同步收據雜項下拉（僅針對被刪除的「未分類/雜項」品項所屬的店）
  const affectedStores = new Set<string | null>()
  for (const m of mappings ?? []) {
    const vg = (m as any).vendor_group
    if (!vg || vg === '雜項' || vg === '未分類') affectedStores.add(m.store_id ?? null)
  }
  for (const sid of affectedStores) deferSyncMisc(sid)

  revalidate()
  return { success: true as const, deleted: mappings?.length ?? 0 }
}

/** 改品項名稱：同步更新 mapping.item_name + 選擇性同步 receipt_items 舊資料 */
export async function renameItem(mappingId: string, newName: string, syncReceipts = false, syncExcelColumn = false) {
  const admin = createAdminClient()
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, excel_column, vendor_group').eq('id', mappingId).maybeSingle()
  if (!mapping) return { error: '找不到品項' }
  const oldName = mapping.item_name as string
  if (!newName.trim()) return { error: '名稱不可空白' }
  const trimmedName = newName.trim()
  const nextExcelColumn = (mapping.excel_column === oldName || syncExcelColumn) ? trimmedName : mapping.excel_column
  if (trimmedName === oldName && nextExcelColumn === mapping.excel_column) return { success: true as const }

  // 檢查同 store 是否已有同名
  if (trimmedName !== oldName) {
    let dupQuery = admin.from('item_column_mappings')
      .select('id').eq('item_name', trimmedName)
    dupQuery = mapping.store_id ? dupQuery.eq('store_id', mapping.store_id) : dupQuery.is('store_id', null)
    const { data: dup } = await dupQuery.maybeSingle()
    if (dup) return { error: `已有同名品項「${trimmedName}」` }
  }

  // 更新 mapping
  await admin.from('item_column_mappings').update({
    item_name: trimmedName,
    // 若 excel_column 跟舊名字一樣，或使用者明確選擇同步，就一起更新。
    excel_column: nextExcelColumn,
    updated_at: new Date().toISOString(),
  }).eq('id', mappingId)

  // 只有全域 mapping 才同步 system_items；店家專屬改名不可牽動其他店。
  if (!mapping.store_id && trimmedName !== oldName) {
    const { data: sys } = await admin.from('system_items')
      .select('id').eq('name', oldName).eq('active', true).maybeSingle()
    if (sys) {
      await admin.from('system_items').update({
        name: trimmedName,
        updated_at: new Date().toISOString(),
      }).eq('id', sys.id)
    }
  }

  // 選擇性同步既有帳目資料，避免改名後舊資料因名稱不同而對不到。
  if (syncReceipts && trimmedName !== oldName) {
    await syncHistoricalItemNames(oldName, trimmedName, mapping.store_id ?? null)
  }

  // 若品項屬「未分類/雜項」→ 同步 receipt_vendors 名稱（先刪舊 + 加新 = full re-sync）
  const vg = (mapping as any).vendor_group
  if (!vg || vg === '雜項' || vg === '未分類') {
    deferSyncMisc(mapping.store_id ?? null)
  }

  revalidate()
  return { success: true as const }
}

async function syncHistoricalItemNames(oldName: string, newName: string, storeId: string | null) {
  const admin = createAdminClient()

  if (storeId) {
    const [{ data: receiptRows }, { data: closingRows }] = await Promise.all([
      admin.from('receipts').select('id').eq('store_id', storeId),
      admin.from('daily_closings').select('id').eq('store_id', storeId),
    ])

    const receiptIds = (receiptRows ?? []).map((r: any) => r.id as string)
    for (let i = 0; i < receiptIds.length; i += 200) {
      const ids = receiptIds.slice(i, i + 200)
      if (ids.length) {
        await admin.from('receipt_items')
          .update({ item_name: newName })
          .eq('item_name', oldName)
          .in('receipt_id', ids)
      }
    }

    const closingIds = (closingRows ?? []).map((c: any) => c.id as string)
    for (let i = 0; i < closingIds.length; i += 200) {
      const ids = closingIds.slice(i, i + 200)
      if (ids.length) {
        await admin.from('order_items')
          .update({ item_name: newName, excel_column: newName })
          .eq('item_name', oldName)
          .in('closing_id', ids)
      }
    }
    return
  }

  // 全域 mapping 沒有店家範圍可限制，使用者確認覆蓋時才更新全系統舊名稱。
  await Promise.all([
    admin.from('receipt_items').update({ item_name: newName }).eq('item_name', oldName),
    admin.from('order_items').update({ item_name: newName, excel_column: newName }).eq('item_name', oldName),
  ])
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
    .select('id, item_name, store_id, vendor_group').in('id', ids)
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

  // 3. 若排序涉及「未分類/雜項」品項 → 同步 receipt_vendors 排序
  const affectedStores = new Set<string | null>()
  for (const m of mappings ?? []) {
    const vg = (m as any).vendor_group
    if (!vg || vg === '雜項' || vg === '未分類') affectedStores.add(m.store_id ?? null)
  }
  for (const sid of affectedStores) deferSyncMisc(sid)

  revalidate()
  return { success: true }
}

/** 每店獨立調整黃色分類順序（Excel Row 1 群組順序）。 */
export async function reorderStoreVendorGroups(storeId: string, vendorGroups: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  if (!storeId) return { error: '缺少店家 ID' }

  const admin = createAdminClient()
  await Promise.all(
    vendorGroups.map((vgName, i) => {
      const order = (i + 1) * 10
      const query = admin
        .from('item_column_mappings')
        .update({ vg_sort_order: order, updated_at: new Date().toISOString() })
        .eq('store_id', storeId)
      return vgName === '未分類'
        ? query.or('vendor_group.is.null,vendor_group.eq.未分類')
        : query.eq('vendor_group', vgName)
    })
  )

  revalidate()
  return { success: true as const }
}

/**
 * 設定「品項層級 doc_type override」
 * 若指定 storeId → 存到 store_items.doc_type_override（該店專屬）
 * 若沒 storeId → 存到 system_items.doc_type_override（全域）
 */
export async function setItemDocOverride(itemName: string, storeId: string | null, docOverride: string | null) {
  // 每店獨立：單據類型直接寫該店那筆 item_column_mappings.doc_type_override（明確值、無 fallback）。
  // 空值 = 明確「無單據」，不會再回退到類別預設。
  if (!storeId) return { error: '缺少店家 ID' }
  const admin = createAdminClient()
  const { error } = await admin.from('item_column_mappings')
    .update({ doc_type_override: docOverride || null, updated_at: new Date().toISOString() })
    .eq('item_name', itemName).eq('store_id', storeId)
  if (error) return { error: error.message }
  revalidateLight()
  return { success: true as const }
}

/** 設定本店某個黃色分類底下所有品項的單據類型。 */
export async function setStoreVendorGroupDocType(storeId: string, vendorGroup: string, docOverride: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  if (!storeId) return { error: '缺少店家 ID' }

  const admin = createAdminClient()
  const query = admin.from('item_column_mappings')
    .update({ doc_type_override: docOverride || null, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)

  const { error } = vendorGroup === '未分類'
    ? await query.or('vendor_group.is.null,vendor_group.eq.未分類')
    : await query.eq('vendor_group', vendorGroup)

  if (error) return { error: error.message }
  revalidateLight()
  return { success: true as const }
}

/** 設定該 mapping 是否納入「梁平退稅」總額 */
export async function setItemRefundFlag(id: string, isRefund: boolean) {
  const admin = createAdminClient()
  const { error } = await admin.from('item_column_mappings')
    .update({ is_refund: isRefund, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return { success: true as const }
}

/** 修改廠商群組名稱（同步更新 system_vendor_groups + item_column_mappings） */
export async function renameVendorGroup(oldName: string, newName: string, storeId?: string) {
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

  if (storeId) {
    // 各店獨立：只改該店的 item_column_mappings，不動全域 system_vendor_groups
    const { data: dup } = await admin.from('item_column_mappings')
      .select('id').eq('store_id', storeId).eq('vendor_group', trimmed).limit(1).maybeSingle()
    if (dup) return { error: `本店已有類別叫「${trimmed}」` }
    await admin.from('item_column_mappings')
      .update({ vendor_group: trimmed, updated_at: new Date().toISOString() })
      .eq('store_id', storeId).eq('vendor_group', oldName)
  } else {
    // 全域模式（無 storeId）：維持舊行為，改全域 system_vendor_groups + 所有 mappings
    const { data: dup } = await admin.from('system_vendor_groups').select('id').eq('name', trimmed).eq('active', true).maybeSingle()
    if (dup) return { error: `已有廠商群組叫「${trimmed}」` }
    await admin.from('system_vendor_groups').update({ name: trimmed, updated_at: new Date().toISOString() }).eq('name', oldName)
    await admin.from('item_column_mappings').update({ vendor_group: trimmed, updated_at: new Date().toISOString() }).eq('vendor_group', oldName)
  }

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

/** 把 fromStoreId 的整份品項對應複製到 toStoreId（會清除目標店的現有對應）。 */
export async function copyStoreMappingsToStore(fromStoreId: string, toStoreId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }
  const { data: profile } = await supabase
    .from('user_profiles').select('role, is_hq').eq('user_id', user.id).single()
  if (!profile?.is_hq && profile?.role !== '老闆') return { error: '權限不足' }

  const admin = createAdminClient()
  const { data: src } = await admin
    .from('item_column_mappings').select('*')
    .eq('store_id', fromStoreId)
  if (!src?.length) return { error: '來源店家無品項對應' }

  await admin.from('item_column_mappings').delete().eq('store_id', toStoreId)
  const { error } = await admin.from('item_column_mappings').insert(
    src.map(({ id: _id, created_at: _c, ...rest }) => ({
      ...rest,
      store_id: toStoreId,
      updated_at: new Date().toISOString(),
    }))
  )
  if (error) return { error: error.message }
  revalidate()
  return { success: true, count: src.length }
}
