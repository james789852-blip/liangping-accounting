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
async function loadStoreItemsFromMappings(storeId: string): Promise<ResolvedStoreItem[]> {
  const admin = createAdminClient()
  const [mappings, { data: vgs }] = await Promise.all([
    // 分頁撈：避免 PostgREST 1000 max-rows 截斷
    fetchAllPaged<any>(() => admin
      .from('item_column_mappings')
      .select('id,item_name,item_category,vendor_group,doc_type_override,sort_order,vg_sort_order,store_id,is_refund,is_tax_addon')
      .eq('store_id', storeId)),
    admin.from('system_vendor_groups').select('id, name, doc_type, sort_order, tax_mode, merge_across_category').eq('active', true),
  ])

  const vgByName = new Map<string, any>((vgs ?? []).map((v: any) => [v.name as string, v]))

  // 同店同名只保留一筆；正常情況資料庫不應有重複，這裡保守去重。
  const byName = new Map<string, any>()
  for (const m of mappings ?? []) {
    const existing = byName.get(m.item_name)
    if (!existing) byName.set(m.item_name, m)
  }

  const items: ResolvedStoreItem[] = []
  for (const m of byName.values()) {
    const vgName = (m.vendor_group ?? '未分類') as string
    const vg = vgByName.get(vgName) ?? null

    // 各店獨立：單據類型只看該店 mapping.doc_type_override，不再吃全域分類預設。
    const effectiveDocType = (m.doc_type_override ?? null) as string | null

    items.push({
      id: m.id as string,
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
      is_tax_addon: !!m.is_tax_addon,
    })
  }

  // 對齊「品項對應管理」：廠商/分類排序優先，廠商內再依品項排序。
  return items.sort(compareResolvedItemsByMappingOrder)
}

export async function getStoreItemsFromMappings(storeId: string): Promise<ResolvedStoreItem[]> {
  // Excel 匯出必須立即反映「品項對應管理」排序；避免 server cache 留住舊欄位順序。
  return loadStoreItemsFromMappings(storeId)
}
