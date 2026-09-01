/**
 * 從 item_column_mappings 撈品項清單（xlsx 匯出用）
 *
 * 為何不用 getStoreItemsResolved？
 * - store_items 可能有 orphan enable（歷史殘留 / 批次 setup），造成 xlsx 多欄
 * - item_column_mappings 是「品項對應管理」UI 的 source of truth
 * - xlsx 應該完全反映對應管理內容，才不會有多餘欄位或重複品項
 * - 各店完全獨立，不使用全域 mapping 繼承
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { ResolvedStoreItem } from '@/lib/store-items-resolver'
import { fetchAllPaged } from '@/lib/supabase-paged'
import { unstable_cache } from 'next/cache'
import {
  disabledAtFromStatusEvents,
  isExplicitItemFromStatusEvents,
  isNegativeFromStatusEvents,
  isUnavailableForReportMonth,
  ITEM_MAPPING_ARCHIVED_EVENT,
  ITEM_MAPPING_DISABLED_EVENT,
  ITEM_MAPPING_EXPLICIT_ITEM_EVENT,
  ITEM_MAPPING_NEGATIVE_DISABLED_EVENT,
  ITEM_MAPPING_NEGATIVE_ENABLED_EVENT,
  ITEM_MAPPING_REACTIVATED_EVENT,
  ITEM_MAPPING_SIGN_FLEXIBLE_EVENT,
  mappingIdFromStatusEvent,
  signModeFromStatusEvents,
  unavailablePeriodsFromStatusEvents,
  type ItemMappingStatusEvent,
} from '@/lib/item-mapping-availability'

export interface ItemMappingVisibilityScope {
  /** YYYY-MM；月報會保留停用當月，從下一個月起才隱藏。 */
  reportMonth?: string
}

function normalizeReportMonth(value?: string): string | null {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null
}

export function compareResolvedItemsByMappingOrder(a: ResolvedStoreItem, b: ResolvedStoreItem): number {
  const groupRank = (name?: string | null) => {
    if ((name ?? '') === '未分類') return 2
    if (['發票', '收據', '估價單', '公司開'].includes(name ?? '')) return 1
    return 0
  }

  return (groupRank(a.vendor_group) - groupRank(b.vendor_group))
    || ((a.vendor_group_sort_order ?? 9999) - (b.vendor_group_sort_order ?? 9999))
    || (a.vendor_group ?? '').localeCompare(b.vendor_group ?? '', 'zh-Hant')
    || ((a.sort_order ?? 1000) - (b.sort_order ?? 1000))
    || a.name.localeCompare(b.name, 'zh-Hant')
}

/**
 * 從 mappings 撈出該店的品項清單，附帶完整的 vg / doc_type / category / sort_order
 * 各店獨立：只讀該店 store_id 的 mapping
 */
async function loadStoreItemsFromMappings(
  storeId: string,
  scope: ItemMappingVisibilityScope = {},
): Promise<ResolvedStoreItem[]> {
  const admin = createAdminClient()
  const [mappings, { data: vgs }, statusEvents] = await Promise.all([
    // 分頁撈：避免 PostgREST 1000 max-rows 截斷
    fetchAllPaged<any>(() => admin
      .from('item_column_mappings')
      .select('id,item_name,item_category,vendor_group,doc_type_override,sort_order,vg_sort_order,store_id,is_refund,is_tax_addon,tax_scope,tax_target_item')
      .eq('store_id', storeId)),
    admin.from('system_vendor_groups').select('id, name, doc_type, sort_order, tax_mode, merge_across_category').eq('active', true),
    fetchAllPaged<ItemMappingStatusEvent>(() => admin
      .from('audit_logs')
      .select('event_type,created_at,metadata')
      .eq('store_id', storeId)
      .in('event_type', [
        ITEM_MAPPING_DISABLED_EVENT,
        ITEM_MAPPING_REACTIVATED_EVENT,
        ITEM_MAPPING_ARCHIVED_EVENT,
        ITEM_MAPPING_NEGATIVE_ENABLED_EVENT,
        ITEM_MAPPING_NEGATIVE_DISABLED_EVENT,
        ITEM_MAPPING_SIGN_FLEXIBLE_EVENT,
        ITEM_MAPPING_EXPLICIT_ITEM_EVENT,
      ])
      .order('created_at')),
  ])

  const eventsByMapping = new Map<string, ItemMappingStatusEvent[]>()
  for (const event of statusEvents ?? []) {
    const mappingId = mappingIdFromStatusEvent(event)
    if (!mappingId) continue
    const events = eventsByMapping.get(mappingId) ?? []
    events.push(event)
    eventsByMapping.set(mappingId, events)
  }

  const reportMonth = normalizeReportMonth(scope.reportMonth)
  let visibleMappings = mappings ?? []
  if (reportMonth) {
    const unavailableIds = new Set([...eventsByMapping.entries()]
      .filter(([, events]) => isUnavailableForReportMonth(reportMonth, unavailablePeriodsFromStatusEvents(events)))
      .map(([mappingId]) => mappingId))
    visibleMappings = visibleMappings.filter(mapping => !unavailableIds.has(mapping.id as string))
  } else {
    // 新帳目與日常表單只顯示目前啟用中的品項。
    visibleMappings = visibleMappings.filter(mapping => !disabledAtFromStatusEvents(eventsByMapping.get(mapping.id as string) ?? []))
  }

  const vgByName = new Map<string, any>((vgs ?? []).map((v: any) => [v.name as string, v]))

  // 同一品名可以分屬不同廠商分類（例如「油豆腐」分類內的「油豆腐」品項）。
  const byName = new Map<string, any>()
  for (const m of visibleMappings) {
    const key = `${m.item_name}||${m.vendor_group ?? ''}`
    const existing = byName.get(key)
    if (!existing) byName.set(key, m)
  }

  const items: ResolvedStoreItem[] = []
  for (const m of byName.values()) {
    const vgName = (m.vendor_group ?? '未分類') as string
    const vg = vgByName.get(vgName) ?? null

    // 各店獨立：單據類型只看該店 mapping.doc_type_override，不再吃全域分類預設。
    const effectiveDocType = (m.doc_type_override ?? null) as string | null

    items.push({
      id: m.id as string,
      mapping_id: m.id as string,
      name: m.item_name as string,
      category: (m.item_category ?? '雜項') as ResolvedStoreItem['category'],
      vendor_group: vgName,
      vendor_group_id: vg?.id ?? null,
      doc_type: effectiveDocType,
      // 品項管理畫面的黃色分類順序是每店獨立的 vg_sort_order。
      vendor_group_sort_order: (m.vg_sort_order ?? 9999) as number,
      tax_mode: ((vg?.tax_mode ?? 'inclusive') as 'inclusive' | 'free'),
      is_system: true,
      sort_order: (m.sort_order ?? 1000) as number,
      vg_merge_across_category: !!vg?.merge_across_category,
      is_refund: !!m.is_refund,
      is_negative: isNegativeFromStatusEvents(eventsByMapping.get(m.id as string) ?? []),
      sign_mode: signModeFromStatusEvents(eventsByMapping.get(m.id as string) ?? []),
      is_explicit_item: isExplicitItemFromStatusEvents(eventsByMapping.get(m.id as string) ?? []),
      is_tax_addon: !!m.is_tax_addon,
      tax_scope: (m.tax_scope ?? 'category') as 'category' | 'item',
      tax_target_item: (m.tax_target_item ?? null) as string | null,
    })
  }

  // 對齊「品項對應管理」：廠商/分類排序優先，廠商內再依品項排序。
  return items.sort(compareResolvedItemsByMappingOrder)
}

export async function getStoreItemsFromMappings(
  storeId: string,
  scope: ItemMappingVisibilityScope = {},
): Promise<ResolvedStoreItem[]> {
  const reportMonth = normalizeReportMonth(scope.reportMonth) ?? 'active'
  // 品項異動會統一 revalidateTag('item-mappings')；一般切頁不必重複撈相同設定。
  return unstable_cache(
    () => loadStoreItemsFromMappings(storeId, scope),
    ['store-items-from-mappings', storeId, reportMonth],
    { revalidate: 300, tags: ['item-mappings'] },
  )()
}
