'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/authed-user'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { syncMiscVendorsFromMappingChange } from '@/lib/misc-sync'
import { canManageCKItems, canManageStoreItems } from '@/lib/user-permissions'
import { historicalItemSyncTargets } from '@/lib/item-history-scope'
import { isMiscVendorGroup, MISC_VENDOR_GROUP, normalizeVendorGroupName } from '@/lib/linked-receipt-category'
import {
  ITEM_MAPPING_ARCHIVED_EVENT,
  ITEM_MAPPING_DISABLED_EVENT,
  ITEM_MAPPING_EXPLICIT_ITEM_EVENT,
  ITEM_MAPPING_NEGATIVE_DISABLED_EVENT,
  ITEM_MAPPING_NEGATIVE_ENABLED_EVENT,
  ITEM_MAPPING_REACTIVATED_EVENT,
  ITEM_MAPPING_SIGN_FLEXIBLE_EVENT,
  type ItemMappingSignMode,
  nextMonthStart,
  taipeiCalendarMonthStart,
} from '@/lib/item-mapping-availability'

const ITEM_CATEGORIES = ['食材', '耗材', '雜項'] as const
type ItemCategory = typeof ITEM_CATEGORIES[number]

function normalizeItemCategory(value?: string | null): ItemCategory {
  return ITEM_CATEGORIES.includes(value as ItemCategory) ? value as ItemCategory : '雜項'
}

async function upsertVendorOnlyMapping(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  vendorGroup: string,
  itemCategory: string,
  vgSortOrder?: number,
) {
  const group = vendorGroup.trim()
  const category = normalizeItemCategory(itemCategory)
  const { data: groupMappings, error: mappingError } = await admin.from('item_column_mappings')
    .select('id, item_name, excel_column, item_category, vendor_group, doc_type_override, vg_sort_order, is_tax_addon')
    .eq('store_id', storeId)
    .eq('vendor_group', group)
  if (mappingError) return { error: mappingError.message }

  const selfMapping = (groupMappings ?? []).find(mapping => (
    mapping.item_name?.trim() === group && mapping.excel_column?.trim() === group
  ))
  const realMappings = (groupMappings ?? []).filter(mapping => (
    mapping.id !== selfMapping?.id && !mapping.is_tax_addon
  ))

  // 舊流程可能把「阿一蔬果」建立成日常用品／雜項內的一個同名品項。
  // 當管理者現在把它拉成獨立廠商時，應沿用舊 mapping id，而不是另建一筆，
  // 這樣歷史帳目的金額、照片與品項連結都能完整保留。
  if (realMappings.length === 0) {
    const { data: sameNameMappings, error: sameNameError } = await admin.from('item_column_mappings')
      .select('id, item_name, excel_column, item_category, vendor_group, doc_type_override, vg_sort_order, is_tax_addon')
      .eq('store_id', storeId)
      .eq('item_name', group)
      .eq('excel_column', group)
    if (sameNameError) return { error: sameNameError.message }

    const legacyCandidates = (sameNameMappings ?? []).filter(mapping => (
      mapping.id !== selfMapping?.id
      && !mapping.is_tax_addon
      && normalizeVendorGroupName(mapping.vendor_group) !== group
    ))

    // 只有唯一候選才自動搬移；若有多筆同名資料就不猜，以免搬錯廠商。
    if (legacyCandidates.length === 1) {
      const legacy = legacyCandidates[0]

      if (selfMapping && selfMapping.id !== legacy.id) {
        const { error: deleteSelfError } = await admin.from('item_column_mappings')
          .delete().eq('id', selfMapping.id)
        if (deleteSelfError) return { error: deleteSelfError.message }
      }

      const { error: moveError } = await admin.from('item_column_mappings')
        .update({
          item_category: category,
          vendor_group: group,
          vg_sort_order: vgSortOrder ?? legacy.vg_sort_order ?? 99999,
          updated_at: new Date().toISOString(),
        })
        .eq('id', legacy.id)
      return moveError
        ? { error: moveError.message }
        : { success: true as const, migratedMappingId: legacy.id }
    }
  }

  // 已有真正品項時，群組分類套用到群組內所有明細。
  if (realMappings.length > 0) {
    const { error } = await admin.from('item_column_mappings')
      .update({ item_category: category, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('vendor_group', group)
    return error ? { error: error.message } : { success: true as const }
  }

  if (selfMapping) {
    const { error } = await admin.from('item_column_mappings')
      .update({ item_category: category, updated_at: new Date().toISOString() })
      .eq('id', selfMapping.id)
    return error ? { error: error.message } : { success: true as const }
  }

  const { error } = await admin.from('item_column_mappings').insert({
    item_name: group,
    excel_column: group,
    item_category: category,
    vendor_group: group,
    store_id: storeId,
    sort_order: 10,
    vg_sort_order: vgSortOrder ?? 99999,
    updated_at: new Date().toISOString(),
  })
  return error ? { error: error.message } : { success: true as const }
}

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

/**
 * 新增品項群組：
 * - vendor：收進收據管理的「廠商」底下（菜商、雜貨、免洗等）。
 * - direct：建立成可由收據管理選擇啟用的獨立大類別（日常用品、貨車保養等）。
 */
export async function createStoreVendorGroup(
  storeId: string,
  name: string,
  sortOrder: number,
  mode: 'vendor' | 'direct' = 'vendor',
  itemCategory: string = '雜項',
) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const trimmed = name.trim()
  if (!trimmed) return { error: '請輸入分類名稱' }
  if (mode === 'vendor' && trimmed === '廠商') return { error: '「廠商」是上層名稱，請輸入實際廠商分類' }

  const admin = createAdminClient()
  const { data: existingGroup, error: existingGroupError } = await admin.from('system_vendor_groups')
    .select('id, sort_order, active')
    .eq('name', trimmed)
    .maybeSingle()
  if (existingGroupError) return { error: existingGroupError.message }

  let groupId = existingGroup?.id as string | undefined
  if (existingGroup) {
    if (!existingGroup.active) {
      const { error } = await admin.from('system_vendor_groups')
        .update({ active: true, kind: 'vendor', updated_at: new Date().toISOString() })
        .eq('id', existingGroup.id)
      if (error) return { error: error.message }
    }
  } else {
    const { data: createdGroup, error } = await admin.from('system_vendor_groups').insert({
      name: trimmed,
      kind: 'vendor',
      sort_order: sortOrder,
      active: true,
    }).select('id').single()
    if (error) return { error: error.message }
    groupId = createdGroup.id
  }

  if (mode === 'vendor') {
    const { data: existingParent, error: parentError } = await admin.from('receipt_categories')
      .select('id, sort_order')
      .eq('store_id', storeId)
      .eq('name', '廠商')
      .maybeSingle()
    if (parentError) return { error: parentError.message }

    let parentId = existingParent?.id as string | undefined
    if (!parentId) {
      const { data: categoryRows } = await admin.from('receipt_categories')
        .select('sort_order').eq('store_id', storeId).gte('sort_order', 0)
      const nextSort = Math.max(0, ...(categoryRows ?? []).map(row => row.sort_order ?? 0)) + 10
      const { data: parent, error } = await admin.from('receipt_categories').insert({
        store_id: storeId,
        name: '廠商',
        sort_order: nextSort,
      }).select('id').single()
      if (error) return { error: error.message }
      parentId = parent.id
    } else if ((existingParent?.sort_order ?? 0) < 0) {
      const { data: categoryRows } = await admin.from('receipt_categories')
        .select('sort_order').eq('store_id', storeId).gte('sort_order', 0)
      const nextSort = Math.max(0, ...(categoryRows ?? []).map(row => row.sort_order ?? 0)) + 10
      const { error } = await admin.from('receipt_categories')
        .update({ sort_order: nextSort }).eq('id', existingParent!.id)
      if (error) return { error: error.message }
    }

    const { data: existingVendor, error: vendorError } = await admin.from('receipt_vendors')
      .select('id')
      .eq('store_id', storeId)
      .eq('category_id', parentId)
      .eq('name', trimmed)
      .maybeSingle()
    if (vendorError) return { error: vendorError.message }
    if (!existingVendor) {
      const { data: vendorRows } = await admin.from('receipt_vendors')
        .select('sort_order').eq('category_id', parentId)
      const nextVendorSort = Math.max(0, ...(vendorRows ?? []).map(row => row.sort_order ?? 0)) + 10
      const { error } = await admin.from('receipt_vendors').insert({
        store_id: storeId,
        category_id: parentId,
        name: trimmed,
        sort_order: nextVendorSort,
      })
      if (error) return { error: error.message }
    }

    // 舊版曾把每個廠商先建立成隱藏的大類別；改用「廠商 → 子類別」後移除候選資料。
    await admin.from('receipt_categories')
      .delete()
      .eq('store_id', storeId)
      .eq('name', trimmed)
      .lt('sort_order', 0)

    const mapped = await upsertVendorOnlyMapping(admin, storeId, trimmed, itemCategory, sortOrder)
    if ('error' in mapped) return { error: mapped.error }
  } else {
    const { data: existingCategory, error: existingCategoryError } = await admin.from('receipt_categories')
      .select('id, sort_order')
      .eq('store_id', storeId)
      .eq('name', trimmed)
      .maybeSingle()
    if (existingCategoryError) return { error: existingCategoryError.message }

    if (!existingCategory) {
      const { error } = await admin.from('receipt_categories').insert({
        store_id: storeId,
        name: trimmed,
        // -2 代表「獨立大類別，尚未由收據管理選擇加入」。
        sort_order: -2,
      })
      if (error) return { error: error.message }
    } else if ((existingCategory.sort_order ?? 0) < 0 && existingCategory.sort_order !== -2) {
      const { error } = await admin.from('receipt_categories')
        .update({ sort_order: -2 }).eq('id', existingCategory.id)
      if (error) return { error: error.message }
    }
  }

  revalidate()
  return { success: true as const, id: groupId, sort_order: existingGroup?.sort_order ?? sortOrder, mode }
}

/**
 * 修改單一據點的分類層級，不移動或刪除底下品項：
 * - vendor：顯示在「廠商」底下。
 * - direct：成為收據管理可選擇啟用的獨立大類別。
 */
export async function setStoreVendorGroupMode(
  storeId: string,
  name: string,
  mode: 'vendor' | 'direct',
) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const group = name.trim()
  if (!group || group === '廠商') return { error: '分類名稱不正確' }

  const admin = createAdminClient()
  const [{ data: category }, { data: parent }, { data: groupMappings }] = await Promise.all([
    admin.from('receipt_categories')
      .select('id, sort_order').eq('store_id', storeId).eq('name', group).maybeSingle(),
    admin.from('receipt_categories')
      .select('id, sort_order').eq('store_id', storeId).eq('name', '廠商').maybeSingle(),
    admin.from('item_column_mappings')
      .select('id, item_name, excel_column, item_category, vendor_group, is_tax_addon, vg_sort_order')
      .eq('store_id', storeId).eq('vendor_group', group),
  ])

  if (mode === 'direct') {
    const { error: categoryError } = category
      ? await admin.from('receipt_categories').update({ sort_order: -2 }).eq('id', category.id)
      : await admin.from('receipt_categories').insert({ store_id: storeId, name: group, sort_order: -2 })
    if (categoryError) return { error: categoryError.message }

    if (parent) {
      const { error } = await admin.from('receipt_vendors')
        .delete().eq('store_id', storeId).eq('category_id', parent.id).eq('name', group)
      if (error) return { error: error.message }
    }

    // 廠商沒有明細時會有一筆內部占位 mapping；改成獨立類別後不再需要。
    const markerIds = (groupMappings ?? [])
      .filter(mapping => !mapping.is_tax_addon
        && mapping.item_name?.trim() === group
        && mapping.excel_column?.trim() === group)
      .map(mapping => mapping.id)
    if (markerIds.length > 0) {
      const { error } = await admin.from('item_column_mappings').delete().in('id', markerIds)
      if (error) return { error: error.message }
    }
  } else {
    let parentId = parent?.id as string | undefined
    if (!parentId) {
      const { data: rows } = await admin.from('receipt_categories')
        .select('sort_order').eq('store_id', storeId).gte('sort_order', 0)
      const sortOrder = Math.max(0, ...(rows ?? []).map(row => row.sort_order ?? 0)) + 10
      const { data: createdParent, error } = await admin.from('receipt_categories').insert({
        store_id: storeId,
        name: '廠商',
        sort_order: sortOrder,
      }).select('id').single()
      if (error) return { error: error.message }
      parentId = createdParent.id
    }

    const { data: existingVendor, error: existingVendorError } = await admin.from('receipt_vendors')
      .select('id').eq('store_id', storeId).eq('category_id', parentId).eq('name', group).maybeSingle()
    if (existingVendorError) return { error: existingVendorError.message }
    if (!existingVendor) {
      const { data: vendorRows } = await admin.from('receipt_vendors')
        .select('sort_order').eq('category_id', parentId)
      const sortOrder = Math.max(0, ...(vendorRows ?? []).map(row => row.sort_order ?? 0)) + 10
      const { error } = await admin.from('receipt_vendors').insert({
        store_id: storeId,
        category_id: parentId,
        name: group,
        sort_order: sortOrder,
      })
      if (error) return { error: error.message }
    }

    if (category) {
      const { error } = await admin.from('receipt_categories').delete().eq('id', category.id)
      if (error) return { error: error.message }
    }

    const realMappings = (groupMappings ?? []).filter(mapping => !mapping.is_tax_addon && !(
      mapping.item_name?.trim() === group && mapping.excel_column?.trim() === group
    ))
    if (realMappings.length === 0) {
      const marker = await upsertVendorOnlyMapping(
        admin,
        storeId,
        group,
        normalizeItemCategory(groupMappings?.[0]?.item_category),
        groupMappings?.[0]?.vg_sort_order ?? undefined,
      )
      if ('error' in marker) return { error: marker.error }
    }
  }

  revalidate()
  return { success: true as const, mode }
}

function canManageStoreType(profile: any, type?: string | null) {
  return type === '央廚' ? canManageCKItems(profile) : canManageStoreItems(profile)
}

async function canManageStoreIds(profile: any, storeIds: (string | null | undefined)[]) {
  const ids = [...new Set(storeIds.filter(Boolean) as string[])]
  if (ids.length === 0) return canManageStoreItems(profile) || canManageCKItems(profile)
  const admin = createAdminClient()
  const { data: stores } = await admin.from('stores').select('id, type').in('id', ids)
  const typeById = new Map((stores ?? []).map((s: any) => [s.id as string, (s.type ?? '店面') as string]))
  return ids.every(id => canManageStoreType(profile, typeById.get(id) ?? '店面'))
}

async function requireCanManageItems(storeId?: string | null) {
  const supabase = await createClient()
  const user = await getVerifiedUser()
  if (!user) return { error: '未登入' as const }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!await canManageStoreIds(profile, [storeId])) {
    return { error: '權限不足，未開啟對應的店面/央廚品項權限' as const }
  }
  return { user, profile, error: null }
}

function normalizedVendorGroup(vendorGroup?: string | null) {
  return (vendorGroup ?? '').trim()
}

async function latestMappingStatusEvent(
  admin: ReturnType<typeof createAdminClient>,
  mappingId: string,
) {
  return admin.from('audit_logs')
    .select('event_type, created_at, metadata')
    .in('event_type', [ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_REACTIVATED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT])
    .contains('metadata', { item_mapping_id: mappingId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function recordMappingDisabled(
  admin: ReturnType<typeof createAdminClient>,
  mapping: { id: string; store_id?: string | null; item_name?: string | null; vendor_group?: string | null },
  userId?: string | null,
) {
  const currentMonth = taipeiCalendarMonthStart()
  const unavailableFrom = nextMonthStart(currentMonth)
  const { error } = await admin.from('audit_logs').insert({
    event_type: ITEM_MAPPING_DISABLED_EVENT,
    severity: 'info',
    store_id: mapping.store_id ?? null,
    user_id: userId ?? null,
    description: `安全停用品項：${mapping.vendor_group ? `${mapping.vendor_group}／` : ''}${mapping.item_name ?? mapping.id}`,
    metadata: {
      item_mapping_id: mapping.id,
      disabled_at: new Date().toISOString(),
      unavailable_from: unavailableFrom,
    },
  })
  return error ? { error: error.message } : { unavailableFrom }
}

async function recordMappingReactivated(
  admin: ReturnType<typeof createAdminClient>,
  mapping: { id: string; store_id?: string | null; item_name?: string | null; vendor_group?: string | null },
  userId?: string | null,
) {
  const availableFrom = taipeiCalendarMonthStart()
  const { error } = await admin.from('audit_logs').insert({
    event_type: ITEM_MAPPING_REACTIVATED_EVENT,
    severity: 'info',
    store_id: mapping.store_id ?? null,
    user_id: userId ?? null,
    description: `重新啟用品項：${mapping.vendor_group ? `${mapping.vendor_group}／` : ''}${mapping.item_name ?? mapping.id}`,
    metadata: {
      item_mapping_id: mapping.id,
      reactivated_at: new Date().toISOString(),
      available_from: availableFrom,
    },
  })
  return error ? { error: error.message } : { availableFrom }
}

async function recordMappingExplicitItem(
  admin: ReturnType<typeof createAdminClient>,
  mapping: { id: string; store_id?: string | null; item_name?: string | null; vendor_group?: string | null },
  userId?: string | null,
) {
  const { error } = await admin.from('audit_logs').insert({
    event_type: ITEM_MAPPING_EXPLICIT_ITEM_EVENT,
    severity: 'info',
    store_id: mapping.store_id ?? null,
    user_id: userId ?? null,
    description: `將分類同名資料設為正式品項：${mapping.vendor_group ? `${mapping.vendor_group}／` : ''}${mapping.item_name ?? mapping.id}`,
    metadata: {
      item_mapping_id: mapping.id,
      explicit_item: true,
      effective_at: new Date().toISOString(),
    },
  })
  return error ? { error: error.message } : { success: true as const }
}

async function recordMappingArchived(
  admin: ReturnType<typeof createAdminClient>,
  mapping: { id: string; store_id?: string | null; item_name?: string | null; vendor_group?: string | null },
  userId?: string | null,
  unavailableFrom?: string | null,
) {
  const preservedUnavailableFrom = unavailableFrom || nextMonthStart(taipeiCalendarMonthStart())
  const { error } = await admin.from('audit_logs').insert({
    event_type: ITEM_MAPPING_ARCHIVED_EVENT,
    severity: 'info',
    store_id: mapping.store_id ?? null,
    user_id: userId ?? null,
    description: `刪除品項（保留歷史）：${mapping.vendor_group ? `${mapping.vendor_group}／` : ''}${mapping.item_name ?? mapping.id}`,
    metadata: {
      item_mapping_id: mapping.id,
      archived_at: new Date().toISOString(),
      unavailable_from: preservedUnavailableFrom,
      history_preserved: true,
    },
  })
  return error ? { error: error.message } : { unavailableFrom: preservedUnavailableFrom }
}

/**
 * system_items 本來就以「品項名稱＋廠商分類」為唯一值。
 * 不能只用名稱找，否則不同分類的同名品項會錯連到同一筆資料。
 */
async function findActiveSystemItem(
  admin: ReturnType<typeof createAdminClient>,
  itemName: string,
  vendorGroup: string | null | undefined,
) {
  const groupName = normalizedVendorGroup(vendorGroup)
  if (isMiscVendorGroup(groupName)) {
    const { data: miscGroups } = await admin.from('system_vendor_groups')
      .select('id').in('name', ['未分類', MISC_VENDOR_GROUP]).eq('active', true)
    const groupFilters = (miscGroups ?? []).map(group => `vendor_group_id.eq.${group.id}`)
    const { data } = await admin.from('system_items')
      .select('id')
      .eq('name', itemName)
      .eq('active', true)
      .or(['vendor_group_id.is.null', ...groupFilters].join(','))
      .limit(1)
      .maybeSingle()
    return data
  }
  let groupId: string | null = null
  if (groupName) {
    const { data: group } = await admin.from('system_vendor_groups')
      .select('id').eq('name', groupName).eq('active', true).maybeSingle()
    groupId = group?.id ?? null
  }

  let query = admin.from('system_items').select('id').eq('name', itemName).eq('active', true)
  query = groupId ? query.eq('vendor_group_id', groupId) : query.is('vendor_group_id', null)
  const { data } = await query.maybeSingle()
  return data
}

export async function saveItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId?: string, vendorGroup?: string
) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const admin = createAdminClient()

  // 檢查是否已存在（避免 unique constraint 錯誤）
  let query = admin.from('item_column_mappings').select('id, item_name, excel_column, store_id, vendor_group').eq('item_name', itemName)
  if (storeId) query = query.eq('store_id', storeId)
  else query = query.is('store_id', null)
  const { data: candidates } = await query
  const requestedGroup = normalizeVendorGroupName(vendorGroup)
  const existing = (candidates ?? []).find(item => normalizeVendorGroupName(item.vendor_group) === requestedGroup)
  if (existing) {
    const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, existing.id)
    if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
    const isVendorOnlyPlaceholder = !!requestedGroup
      && existing.item_name.trim() === requestedGroup
      && (existing.excel_column ?? '').trim() === requestedGroup
    const needsReactivation = [ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')
    if (isVendorOnlyPlaceholder) {
      const explicit = await recordMappingExplicitItem(admin, existing, auth.user?.id)
      if ('error' in explicit) return { error: `新增失敗：${explicit.error}` }
    }
    if (needsReactivation) {
      const reactivated = await recordMappingReactivated(admin, existing, auth.user?.id)
      if ('error' in reactivated) return { error: `重新啟用失敗：${reactivated.error}` }
    }
    if (isVendorOnlyPlaceholder || needsReactivation) {
      const { error } = await admin.from('item_column_mappings').update({
        excel_column: excelColumn,
        item_category: itemCategory,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) return { error: `重新啟用失敗：${error.message}` }
      const ensured = await ensureSystemItemAndEnable(itemName, itemCategory, requestedGroup, storeId)
      if (isMiscVendorGroup(vendorGroup)) deferSyncMisc(storeId ?? null)
      revalidate()
      return { success: true as const, reactivated: needsReactivation, convertedPlaceholder: isVendorOnlyPlaceholder, newVg: ensured.newlyCreatedVg }
    }
    return { success: true as const, alreadyExists: true as const }
  }

  // 分類同名 mapping 可能只是內部佔位，也可能是使用者明確新增的正式品項
  // （例如「其他／其他」）。新增同分類品項時一律保留它，避免刪除已被歷史
  // 帳目引用的 mapping；新品項只繼承分類的單據類型與排序設定。
  let vendorOnlyDocType: string | null = null
  let vendorOnlyVgSort: number | null = null
  if (storeId && requestedGroup && itemName.trim() !== requestedGroup) {
    const { data: vendorOnly } = await admin.from('item_column_mappings')
      .select('id, doc_type_override, vg_sort_order')
      .eq('store_id', storeId)
      .eq('vendor_group', requestedGroup)
      .eq('item_name', requestedGroup)
      .eq('excel_column', requestedGroup)
      .maybeSingle()
    if (vendorOnly) {
      vendorOnlyDocType = vendorOnly.doc_type_override ?? null
      vendorOnlyVgSort = vendorOnly.vg_sort_order ?? null
    }
  }

  // 1. 寫 item_column_mappings
  //    sort_order 排到該 vg 內現有最大值 +10 → 新品項永遠在該分類最下方
  let peerQuery = admin.from('item_column_mappings').select('sort_order, vg_sort_order')
  peerQuery = storeId ? peerQuery.eq('store_id', storeId) : peerQuery.is('store_id', null)
  peerQuery = isMiscVendorGroup(vendorGroup)
    ? peerQuery.or('vendor_group.is.null,vendor_group.eq.未分類,vendor_group.eq.雜項')
    : peerQuery.eq('vendor_group', requestedGroup)
  const { data: peers } = await peerQuery
  const maxSort = Math.max(0, ...(peers ?? []).map((p: any) => p.sort_order ?? 0))
  const newSort = maxSort + 10

  // 每店獨立：vg_sort_order（類別排序）繼承該店該類別現有品項的值（同類別須一致）；
  //           若是全新類別，排到該店所有類別的最後。
  let vgSort: number
  const existingVgSort = vendorOnlyVgSort
    ?? (peers ?? []).map((p: any) => p.vg_sort_order).find((v: any) => v != null)
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
    vendor_group: requestedGroup,
    store_id: storeId ?? null, sort_order: newSort, vg_sort_order: vgSort,
    doc_type_override: vendorOnlyDocType,
    updated_at: new Date().toISOString(),
  })
  if (insertErr) return { error: `新增失敗：${insertErr.message}` }

  // 2. 確保 system_items + store_items 也有這品項
  const ensured = await ensureSystemItemAndEnable(itemName, itemCategory, requestedGroup, storeId)

  // 3. 若品項屬「未分類/雜項」→ 同步到收據雜項下拉
  if (isMiscVendorGroup(vendorGroup)) {
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
  const existingSys = await findActiveSystemItem(admin, itemName, vendorGroup)
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
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  if (!items.length) return { success: true }
  const admin = createAdminClient()
  await admin.from('item_column_mappings').insert(
    items.map(i => ({ ...i, store_id: storeId ?? null, updated_at: new Date().toISOString() }))
  )
  revalidate()
  return { success: true }
}

export async function deleteItemMapping(id: string) {
  const admin = createAdminClient()

  // 先撈 mapping 資料，用來反查 system_item + store_item
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('item_name, store_id, vendor_group').eq('id', id).maybeSingle()
  const auth = await requireCanManageItems(mapping?.store_id ?? null)
  if (auth.error) return { error: auth.error }

  if (!mapping) return { error: '找不到品項' }
  const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, id)
  if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
  if ([ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')) {
    return { success: true as const, disabled: 0, alreadyDisabled: true as const }
  }
  const period = await recordMappingDisabled(admin, { id, ...mapping }, auth.user?.id)
  if ('error' in period) return { error: `安全停用失敗：${period.error}` }

  // 若 mapping 綁定特定店家 → 同步 disable 該店的 store_item（否則 xlsx 匯出還會有這欄）
  if (mapping?.store_id && mapping?.item_name) {
    const sys = await findActiveSystemItem(admin, mapping.item_name, mapping.vendor_group)
    if (sys) {
      await admin.from('store_items')
        .update({ enabled: false })
        .eq('store_id', mapping.store_id)
        .eq('system_item_id', sys.id)
    }
  }

  // 若原本屬「未分類/雜項」→ 同步移除收據雜項下拉
  const oldVg = mapping?.vendor_group
  if (isMiscVendorGroup(oldVg)) {
    deferSyncMisc(mapping?.store_id ?? null)
  }

  revalidate()
  return { success: true as const, disabled: 1, unavailableFrom: period.unavailableFrom }
}

/** 重新啟用安全停用的品項；歷史月份的停用區間會保留。 */
export async function reactivateItemMapping(id: string) {
  const admin = createAdminClient()
  const { data: mapping, error: mappingError } = await admin.from('item_column_mappings')
    .select('id, item_name, item_category, store_id, vendor_group')
    .eq('id', id)
    .maybeSingle()
  if (mappingError) return { error: mappingError.message }
  if (!mapping) return { error: '找不到品項' }
  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }
  const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, id)
  if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
  if (![ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')) {
    return { success: true as const, alreadyActive: true as const }
  }
  const reactivated = await recordMappingReactivated(admin, mapping, auth.user?.id)
  if ('error' in reactivated) return { error: `重新啟用失敗：${reactivated.error}` }

  await ensureSystemItemAndEnable(
    mapping.item_name,
    mapping.item_category ?? '雜項',
    mapping.vendor_group ?? undefined,
    mapping.store_id ?? undefined,
  )
  if (isMiscVendorGroup(mapping.vendor_group)) deferSyncMisc(mapping.store_id ?? null)
  revalidate()
  return { success: true as const }
}

/**
 * 將已安全停用的品項從管理清單封存。
 * 這裡刻意不 delete item_column_mappings、store_items 或任何帳目明細，
 * 因此過去月份的品項欄位、內容、金額與 Excel／試算表都仍能按原 mapping 還原。
 */
export async function archiveItemMapping(id: string) {
  const admin = createAdminClient()
  const { data: mapping, error: mappingError } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group')
    .eq('id', id)
    .maybeSingle()
  if (mappingError) return { error: mappingError.message }
  if (!mapping) return { error: '找不到品項' }

  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }
  const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, id)
  if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
  if (latestStatus?.event_type === ITEM_MAPPING_ARCHIVED_EVENT) {
    return { success: true as const, alreadyArchived: true as const }
  }
  if (latestStatus?.event_type !== ITEM_MAPPING_DISABLED_EVENT) {
    return { error: '請先安全停用品項，再執行刪除（保留歷史）' }
  }

  const unavailableFrom = typeof latestStatus.metadata?.unavailable_from === 'string'
    ? latestStatus.metadata.unavailable_from
    : null
  const archived = await recordMappingArchived(admin, mapping, auth.user?.id, unavailableFrom)
  if ('error' in archived) return { error: `刪除失敗：${archived.error}` }

  revalidate()
  return { success: true as const, historyPreserved: true as const }
}

export async function updateItemMapping(id: string, excelColumn: string, itemCategory: string, vendorGroup?: string | null) {
  const admin = createAdminClient()

  // 撈原 mapping 拿 item_name + store_id + 舊 vg
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('item_name, store_id, vendor_group').eq('id', id).maybeSingle()
  const auth = await requireCanManageItems(mapping?.store_id ?? null)
  if (auth.error) return { error: auth.error }
  const oldVg = mapping?.vendor_group ?? null
  const newVg = vendorGroup !== undefined ? normalizeVendorGroupName(vendorGroup) : oldVg

  await admin.from('item_column_mappings').update({
    excel_column: excelColumn, item_category: itemCategory,
    vendor_group: vendorGroup !== undefined ? newVg : undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  // 同步 store_items.custom_vendor_group_id（xlsx 匯出讀這個）
  if (mapping?.store_id && mapping.item_name && vendorGroup !== undefined) {
    let vgId: string | null = null
    if (newVg?.trim()) {
      const { data: vg } = await admin.from('system_vendor_groups')
        .select('id').eq('name', newVg.trim()).eq('active', true).maybeSingle()
      vgId = vg?.id ?? null
    }
    const sys = await findActiveSystemItem(admin, mapping.item_name, oldVg)
    if (sys) {
      await admin.from('store_items')
        .update({ custom_vendor_group_id: vgId })
        .eq('store_id', mapping.store_id)
        .eq('system_item_id', sys.id)
    }
  }

  // 若 vg 涉及「未分類/雜項」（進或出）→ 同步收據雜項下拉
  const wasMisc = isMiscVendorGroup(oldVg)
  const isMisc = isMiscVendorGroup(newVg)
  if (wasMisc || isMisc) {
    deferSyncMisc(mapping?.store_id ?? null)
  }

  revalidate()
  return { success: true }
}

export async function setItemMapping(
  itemName: string, excelColumn: string, itemCategory: string, storeId: string
) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const admin = createAdminClient()
  const { data: existing } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group').eq('item_name', itemName).eq('store_id', storeId).maybeSingle()
  if (existing) {
    const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, existing.id)
    if (statusError) return { error: statusError.message }
    if ([ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')) {
      const reactivated = await recordMappingReactivated(admin, existing, auth.user?.id)
      if ('error' in reactivated) return { error: reactivated.error }
    }
    const { error } = await admin.from('item_column_mappings').update({
      excel_column: excelColumn,
      item_category: itemCategory,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('item_column_mappings').insert({
      item_name: itemName, excel_column: excelColumn, item_category: itemCategory,
      store_id: storeId, updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
  }
  revalidate()
  return { success: true }
}

/** 批次安全停用品項 */
export async function batchDeleteItemMappings(ids: string[]) {
  if (ids.length === 0) return { success: true as const, disabled: 0 }
  const admin = createAdminClient()

  // 撈全部 mappings 資料
  const { data: mappings } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group').in('id', ids)
  const auth = await requireCanManageItems()
  if (auth.error) return { error: auth.error }
  if (!await canManageStoreIds(auth.profile, (mappings ?? []).map((m: any) => m.store_id))) {
    return { error: '權限不足，批次品項包含不可管理的店家' as const }
  }

  for (const mapping of mappings ?? []) {
    const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, mapping.id)
    if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
    if ([ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')) continue
    const period = await recordMappingDisabled(admin, mapping, auth.user?.id)
    if ('error' in period) return { error: `安全停用失敗：${period.error}` }
  }

  // 同步 disable 店家專屬 store_items
  for (const m of mappings ?? []) {
    if (!m.store_id || !m.item_name) continue
    const sys = await findActiveSystemItem(admin, m.item_name, m.vendor_group)
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
    if (isMiscVendorGroup(vg)) affectedStores.add(m.store_id ?? null)
  }
  for (const sid of affectedStores) deferSyncMisc(sid)

  revalidate()
  return { success: true as const, disabled: mappings?.length ?? 0 }
}

/** 改品項名稱：同步更新 mapping.item_name + 選擇性同步 receipt_items 舊資料 */
export async function renameItem(mappingId: string, newName: string, syncReceipts = false, syncExcelColumn = false) {
  const admin = createAdminClient()
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, excel_column, vendor_group').eq('id', mappingId).maybeSingle()
  if (!mapping) return { error: '找不到品項' }
  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }
  const oldName = mapping.item_name as string
  if (!newName.trim()) return { error: '名稱不可空白' }
  const trimmedName = newName.trim()
  const nextExcelColumn = (mapping.excel_column === oldName || syncExcelColumn) ? trimmedName : mapping.excel_column
  if (trimmedName === oldName && nextExcelColumn === mapping.excel_column) return { success: true as const }

  // 同店同名可存在於不同廠商分類；只擋同一分類的重複名稱。
  if (trimmedName !== oldName) {
    let dupQuery = admin.from('item_column_mappings')
      .select('id, vendor_group').eq('item_name', trimmedName)
    dupQuery = mapping.store_id ? dupQuery.eq('store_id', mapping.store_id) : dupQuery.is('store_id', null)
    const { data: duplicateCandidates } = await dupQuery
    const dup = (duplicateCandidates ?? []).find(candidate =>
      normalizedVendorGroup(candidate.vendor_group) === normalizedVendorGroup(mapping.vendor_group)
    )
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
    const sys = await findActiveSystemItem(admin, oldName, mapping.vendor_group)
    if (sys) {
      await admin.from('system_items').update({
        name: trimmedName,
        updated_at: new Date().toISOString(),
      }).eq('id', sys.id)
    }
  }

  // 選擇性同步既有帳目資料，避免改名後舊資料因名稱不同而對不到。
  if (syncReceipts && trimmedName !== oldName) {
    await syncHistoricalItemNames(oldName, trimmedName, mapping.store_id ?? null, mapping.vendor_group, mapping.id)
  }

  // 若品項屬「未分類/雜項」→ 同步 receipt_vendors 名稱（先刪舊 + 加新 = full re-sync）
  const vg = (mapping as any).vendor_group
  if (isMiscVendorGroup(vg)) {
    deferSyncMisc(mapping.store_id ?? null)
  }

  revalidate()
  return { success: true as const }
}

async function syncHistoricalItemNames(
  oldName: string,
  newName: string,
  storeId: string | null,
  vendorGroup: string | null | undefined,
  mappingId: string,
) {
  const admin = createAdminClient()
  const targets = historicalItemSyncTargets(vendorGroup)

  if (storeId) {
    const [{ data: receiptRows }, { data: closingRows }] = await Promise.all([
      targets.receiptItems
        ? admin.from('receipts').select('id').eq('store_id', storeId).eq('vendor_name', vendorGroup ?? '')
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
      targets.orderItems
        ? admin.from('daily_closings').select('id').eq('store_id', storeId)
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
    ])

    const receiptIds = (receiptRows ?? []).map((r: any) => r.id as string)
    for (let i = 0; i < receiptIds.length; i += 200) {
      const ids = receiptIds.slice(i, i + 200)
      if (ids.length) {
        await admin.from('receipt_items')
          .update({ item_name: newName })
          .eq('item_mapping_id', mappingId)
          .in('receipt_id', ids)
        await admin.from('receipt_items')
          .update({ item_name: newName })
          .is('item_mapping_id', null)
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
          .eq('item_mapping_id', mappingId)
          .in('closing_id', ids)
        await admin.from('order_items')
          .update({ item_name: newName, excel_column: newName })
          .is('item_mapping_id', null)
          .eq('item_name', oldName)
          .in('closing_id', ids)
      }
    }
    return
  }

  // 全域 mapping 沒有店家範圍可安全推斷同名歷史資料，只更新已綁定
  // mapping id 的資料；未綁定資料留給明確的資料修復流程，禁止猜測。
  await Promise.all([
    targets.receiptItems
      ? admin.from('receipt_items').update({ item_name: newName }).eq('item_mapping_id', mappingId)
      : Promise.resolve(),
    targets.orderItems
      ? admin.from('order_items').update({ item_name: newName, excel_column: newName }).eq('item_mapping_id', mappingId)
      : Promise.resolve(),
  ])
}

export async function reorderItemMappings(ids: string[]) {
  if (ids.length === 0) return { success: true }
  const admin = createAdminClient()

  const { data: mappings } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group').in('id', ids)
  const auth = await requireCanManageItems()
  if (auth.error) return { error: auth.error }
  if (!await canManageStoreIds(auth.profile, (mappings ?? []).map((m: any) => m.store_id))) {
    return { error: '權限不足，排序品項包含不可管理的店家' as const }
  }

  // 1. 更新 item_column_mappings.sort_order（UI 排序）
  await Promise.all(
    ids.map((id, i) => admin.from('item_column_mappings').update({ sort_order: (i + 1) * 10 }).eq('id', id))
  )

  // 2. 同步 system_items / store_items 的 sort_order（xlsx 匯出依這個排）
  if (mappings?.length) {
    // 撈所有涉及的 system_items
    await Promise.all(ids.map(async (id, i) => {
      const m = mappings.find(x => x.id === id)
      if (!m) return
      const order = (i + 1) * 10
      const systemItem = await findActiveSystemItem(admin, m.item_name, m.vendor_group)
      const sysId = systemItem?.id
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
    if (isMiscVendorGroup(vg)) affectedStores.add(m.store_id ?? null)
  }
  for (const sid of affectedStores) deferSyncMisc(sid)

  revalidate()
  return { success: true }
}

/** 每店獨立調整黃色分類順序（Excel Row 1 群組順序）。 */
export async function reorderStoreVendorGroups(storeId: string, vendorGroups: string[]) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  if (!storeId) return { error: '缺少店家 ID' }

  const admin = createAdminClient()
  await Promise.all(
    vendorGroups.map((vgName, i) => {
      const order = (i + 1) * 10
      const query = admin
        .from('item_column_mappings')
        .update({ vg_sort_order: order, updated_at: new Date().toISOString() })
        .eq('store_id', storeId)
      return isMiscVendorGroup(vgName)
        ? query.or('vendor_group.is.null,vendor_group.eq.未分類,vendor_group.eq.雜項')
        : query.eq('vendor_group', vgName)
    })
  )

  // 收據管理中同名的連動類別使用相同順序，兩個管理畫面不再各排一次。
  const { data: linkedCategories } = await admin.from('receipt_categories')
    .select('id, name')
    .eq('store_id', storeId)
    .gte('sort_order', 0)
    .in('name', vendorGroups)
  await Promise.all((linkedCategories ?? []).map(category => {
    const index = vendorGroups.indexOf(category.name)
    return admin.from('receipt_categories')
      .update({ sort_order: (index + 1) * 10 })
      .eq('id', category.id)
  }))

  revalidate()
  return { success: true as const }
}

/**
 * 設定「品項層級 doc_type override」
 * 若指定 storeId → 存到 store_items.doc_type_override（該店專屬）
 * 若沒 storeId → 存到 system_items.doc_type_override（全域）
 */
export async function setItemDocOverride(itemName: string, storeId: string | null, docOverride: string | null) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
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
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  if (!storeId) return { error: '缺少店家 ID' }

  const admin = createAdminClient()
  const query = admin.from('item_column_mappings')
    .update({ doc_type_override: docOverride || null, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)

  const { error } = isMiscVendorGroup(vendorGroup)
    ? await query.or('vendor_group.is.null,vendor_group.eq.未分類,vendor_group.eq.雜項')
    : await query.eq('vendor_group', vendorGroup)

  if (error) return { error: error.message }
  revalidateLight()
  return { success: true as const }
}

/**
 * 設定廠商群組的食材／耗材／雜項分類。
 * 沒有明細品項時會建立一筆不顯示於 UI 的群組對應，讓店長可直接輸入總額。
 */
export async function setStoreVendorGroupItemCategory(
  storeId: string,
  vendorGroup: string,
  itemCategory: string,
) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const group = vendorGroup.trim()
  if (!storeId || !group) return { error: '缺少店家或廠商名稱' }

  const admin = createAdminClient()
  const result = await upsertVendorOnlyMapping(admin, storeId, group, itemCategory)
  if ('error' in result) return { error: result.error }
  revalidate()
  return { success: true as const, itemCategory: normalizeItemCategory(itemCategory) }
}

/** 設定該 mapping 是否納入「梁平退稅」總額 */
export async function setItemRefundFlag(id: string, isRefund: boolean) {
  const admin = createAdminClient()
  const { data: mapping } = await admin.from('item_column_mappings').select('store_id').eq('id', id).maybeSingle()
  const auth = await requireCanManageItems(mapping?.store_id ?? null)
  if (auth.error) return { error: auth.error }
  const { error } = await admin.from('item_column_mappings')
    .update({ is_refund: isRefund, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return { success: true as const }
}

/** 設定店面金額模式；設定異動只影響後續輸入，不回寫任何歷史帳目。 */
export async function setItemSignMode(id: string, signMode: ItemMappingSignMode) {
  if (!['positive', 'negative', 'flexible'].includes(signMode)) return { error: '金額模式不正確' }
  const admin = createAdminClient()
  const { data: mapping, error: mappingError } = await admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group')
    .eq('id', id)
    .maybeSingle()
  if (mappingError) return { error: mappingError.message }
  if (!mapping) return { error: '找不到品項' }
  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }

  const eventType = signMode === 'negative'
    ? ITEM_MAPPING_NEGATIVE_ENABLED_EVENT
    : signMode === 'flexible'
      ? ITEM_MAPPING_SIGN_FLEXIBLE_EVENT
      : ITEM_MAPPING_NEGATIVE_DISABLED_EVENT
  const modeLabel = signMode === 'negative' ? '固定負數' : signMode === 'flexible' ? '每筆正負' : '固定正數'
  const { error } = await admin.from('audit_logs').insert({
    event_type: eventType,
    severity: 'info',
    store_id: mapping.store_id ?? null,
    user_id: auth.user?.id ?? null,
    description: `設定店面品項金額模式為${modeLabel}：${mapping.vendor_group ? `${mapping.vendor_group}／` : ''}${mapping.item_name}`,
    metadata: {
      item_mapping_id: mapping.id,
      sign_mode: signMode,
      is_negative: signMode === 'negative',
      effective_at: new Date().toISOString(),
      historical_amounts_preserved: true,
    },
  })
  if (error) return { error: error.message }
  revalidate()
  return { success: true as const, signMode }
}

/** 保留舊呼叫相容；新介面改用三態金額模式。 */
export async function setItemNegativeFlag(id: string, isNegative: boolean) {
  return setItemSignMode(id, isNegative ? 'negative' : 'positive')
}

/**
 * 將品項設為稅外加自動入帳品項。
 *
 * 同一廠商分類可以同時存在「水-稅金」（指定品項）與「免洗-稅金」（整個分類）;
 * 店長端會先比對收據已選的原始品項，找不到指定品項時才套用分類稅金。
 */
export async function setItemTaxAddonFlag(id: string, enabled: boolean) {
  const admin = createAdminClient()
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('id, store_id, vendor_group').eq('id', id).maybeSingle()
  if (!mapping) return { error: '找不到品項' }
  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }
  if (!mapping.store_id || !mapping.vendor_group) return { error: '稅外加品項必須屬於指定店家與廠商分類' }

  const { error } = await admin.from('item_column_mappings')
    .update({ is_tax_addon: enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return { success: true as const }
}

/** 設定稅外加套用範圍：整個分類，或指定單一原始品項。 */
export async function setItemTaxAddonScope(
  id: string,
  scope: 'category' | 'item',
  targetItem?: string | null,
) {
  const admin = createAdminClient()
  const { data: mapping } = await admin.from('item_column_mappings')
    .select('id, store_id, vendor_group, is_tax_addon').eq('id', id).maybeSingle()
  if (!mapping) return { error: '找不到品項' }
  const auth = await requireCanManageItems(mapping.store_id ?? null)
  if (auth.error) return { error: auth.error }
  if (!mapping.is_tax_addon) return { error: '請先啟用稅外加' }
  const target = targetItem?.trim() || null
  if (scope === 'item' && !target) return { error: '單一品項模式需要指定原始品項' }
  if (scope === 'item') {
    const { data: targetMapping } = await admin.from('item_column_mappings')
      .select('id')
      .eq('store_id', mapping.store_id)
      .eq('vendor_group', mapping.vendor_group)
      .eq('item_name', target)
      .eq('is_tax_addon', false)
      .limit(1)
      .maybeSingle()
    if (!targetMapping) return { error: '指定品項必須是同一分類下的原始品項' }
  }

  const { error } = await admin.from('item_column_mappings')
    .update({ tax_scope: scope, tax_target_item: scope === 'item' ? target : null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidate()
  return { success: true as const }
}

/** 修改廠商群組名稱（同步更新品項對應與同名的收據管理類別） */
export async function renameVendorGroup(oldName: string, newName: string, storeId?: string) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }
  const trimmed = newName.trim()
  if (!trimmed) return { error: '名稱不能空' }
  if (trimmed === oldName) return { success: true as const }

  const admin = createAdminClient()

  // 品項管理中的同名分類是收據管理的資料來源；改名時兩邊必須一起更新。
  let oldReceiptCategoriesQuery = admin.from('receipt_categories')
    .select('id, store_id').eq('name', oldName)
  if (storeId) oldReceiptCategoriesQuery = oldReceiptCategoriesQuery.eq('store_id', storeId)
  const { data: oldReceiptCategories, error: oldReceiptCategoriesError } = await oldReceiptCategoriesQuery
  if (oldReceiptCategoriesError) return { error: oldReceiptCategoriesError.message }

  const receiptStoreIds = [...new Set((oldReceiptCategories ?? []).map(category => category.store_id as string))]
  if (receiptStoreIds.length > 0) {
    const { data: duplicateReceiptCategories, error: duplicateReceiptCategoriesError } = await admin
      .from('receipt_categories')
      .select('store_id')
      .in('store_id', receiptStoreIds)
      .eq('name', trimmed)
    if (duplicateReceiptCategoriesError) return { error: duplicateReceiptCategoriesError.message }
    if ((duplicateReceiptCategories ?? []).length > 0) {
      return { error: `收據管理已有類別叫「${trimmed}」，請先合併或刪除重複類別` }
    }
  }

  if (storeId) {
    // 各店獨立：只改該店的 item_column_mappings，不動全域 system_vendor_groups
    const { data: dup } = await admin.from('item_column_mappings')
      .select('id').eq('store_id', storeId).eq('vendor_group', trimmed).limit(1).maybeSingle()
    if (dup) return { error: `本店已有類別叫「${trimmed}」` }
    const { error: mappingRenameError } = await admin.from('item_column_mappings')
      .update({ vendor_group: trimmed, updated_at: new Date().toISOString() })
      .eq('store_id', storeId).eq('vendor_group', oldName)
    if (mappingRenameError) return { error: mappingRenameError.message }

    // 舊版店面單據下拉另存於 receipt_vendors；一併改名，避免其他仍讀舊表的頁面不同步。
    const { data: receiptCategory } = await admin.from('receipt_categories')
      .select('id').eq('store_id', storeId).eq('name', '廠商').maybeSingle()
    if (receiptCategory) {
      const { data: existingNew } = await admin.from('receipt_vendors')
        .select('id').eq('store_id', storeId).eq('category_id', receiptCategory.id).eq('name', trimmed).maybeSingle()
      if (existingNew) {
        await admin.from('receipt_vendors')
          .delete().eq('store_id', storeId).eq('category_id', receiptCategory.id).eq('name', oldName)
      } else {
        await admin.from('receipt_vendors')
          .update({ name: trimmed })
          .eq('store_id', storeId).eq('category_id', receiptCategory.id).eq('name', oldName)
      }
    }
  } else {
    // 全域模式（無 storeId）：維持舊行為，改全域 system_vendor_groups + 所有 mappings
    const { data: dup } = await admin.from('system_vendor_groups').select('id').eq('name', trimmed).eq('active', true).maybeSingle()
    if (dup) return { error: `已有廠商群組叫「${trimmed}」` }
    const { error: systemRenameError } = await admin.from('system_vendor_groups')
      .update({ name: trimmed, updated_at: new Date().toISOString() }).eq('name', oldName)
    if (systemRenameError) return { error: systemRenameError.message }
    const { error: mappingRenameError } = await admin.from('item_column_mappings')
      .update({ vendor_group: trimmed, updated_at: new Date().toISOString() }).eq('vendor_group', oldName)
    if (mappingRenameError) return { error: mappingRenameError.message }
  }

  const receiptCategoryIds = (oldReceiptCategories ?? []).map(category => category.id as string)
  if (receiptCategoryIds.length > 0) {
    const { error: receiptCategoryRenameError } = await admin.from('receipt_categories')
      .update({ name: trimmed })
      .in('id', receiptCategoryIds)
    if (receiptCategoryRenameError) return { error: receiptCategoryRenameError.message }
  }

  revalidate()
  return { success: true as const }
}

/**
 * 安全停用整個廠商群組（mapping 與歷史帳目保留）。
 * @param vgName - vendor_group 名稱
 * @param storeId - 若有 → 只停用該店 mappings；若沒 → 也 deactivate 全域 vg
 */
export async function deleteVendorGroupWithItems(vgName: string, storeId?: string) {
  const auth = await requireCanManageItems(storeId)
  if (auth.error) return { error: auth.error }

  const admin = createAdminClient()

  // 1. 找 vg 底下的 mappings
  let mapQuery = admin.from('item_column_mappings')
    .select('id, item_name, store_id, vendor_group')
    .eq('vendor_group', vgName)
  if (storeId) mapQuery = mapQuery.eq('store_id', storeId)
  const { data: mappings } = await mapQuery
  const itemNames = [...new Set((mappings ?? []).map((m: any) => m.item_name as string))]

  // 2. 安全停用 mappings；本月與過去月份報表仍保留欄位。
  if (mappings && mappings.length > 0) {
    for (const mapping of mappings) {
      const { data: latestStatus, error: statusError } = await latestMappingStatusEvent(admin, mapping.id)
      if (statusError) return { error: `讀取品項狀態失敗：${statusError.message}` }
      if ([ITEM_MAPPING_DISABLED_EVENT, ITEM_MAPPING_ARCHIVED_EVENT].includes(latestStatus?.event_type ?? '')) continue
      const period = await recordMappingDisabled(admin, mapping, auth.user?.id)
      if ('error' in period) return { error: `安全停用失敗：${period.error}` }
    }
  }

  // 3. Disable 對應 store_items
  if (itemNames.length > 0) {
    const systemItems = await Promise.all(
      itemNames.map(itemName => findActiveSystemItem(admin, itemName, vgName))
    )
    const sysIds = systemItems.flatMap(item => item?.id ? [item.id] : [])
    if (sysIds.length > 0) {
      let siQuery = admin.from('store_items').update({ enabled: false }).in('system_item_id', sysIds)
      if (storeId) siQuery = siQuery.eq('store_id', storeId)
      await siQuery
    }
  }

  // 4. 若沒指定 store（全域刪除）→ deactivate system_vendor_group
  if (!storeId) {
    await admin.from('system_vendor_groups').update({ active: false }).eq('name', vgName)
  } else {
    // 每店分類停用後同步移除新帳目下拉；歷史帳目仍由 mapping 快照保留。
    await admin.from('receipt_categories')
      .delete()
      .eq('store_id', storeId)
      .eq('name', vgName)

    const { data: vendorParent } = await admin.from('receipt_categories')
      .select('id').eq('store_id', storeId).eq('name', '廠商').maybeSingle()
    if (vendorParent) {
      await admin.from('receipt_vendors')
        .delete()
        .eq('store_id', storeId)
        .eq('category_id', vendorParent.id)
        .eq('name', vgName)
    }
  }

  revalidate()
  return { success: true as const, mappingsDisabled: mappings?.length ?? 0, itemsAffected: itemNames.length }
}

/** 把 fromStoreId 的整份品項對應複製到 toStoreId（會清除目標店的現有對應）。 */
export async function copyStoreMappingsToStore(fromStoreId: string, toStoreId: string) {
  const auth = await requireCanManageItems(toStoreId)
  if (auth.error) return { error: auth.error }
  if (!await canManageStoreIds(auth.profile, [fromStoreId, toStoreId])) {
    return { error: '權限不足，無法複製到不可管理的店家' as const }
  }

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
