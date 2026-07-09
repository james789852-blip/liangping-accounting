/**
 * 從 item_column_mappings 撈品項清單（xlsx 匯出用）
 *
 * 為何不用 getStoreItemsResolved？
 * - store_items 可能有 orphan enable（歷史殘留 / 批次 setup），造成 xlsx 多欄
 * - item_column_mappings 是「品項對應管理」UI 的 source of truth
 * - xlsx 應該完全反映對應管理內容，才不會有多餘欄位或重複品項
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { ResolvedStoreItem } from '@/lib/store-items-resolver'
import { fetchAllPaged } from '@/lib/supabase-paged'
import { unstable_cache } from 'next/cache'

export function compareResolvedItemsByMappingOrder(a: ResolvedStoreItem, b: ResolvedStoreItem): number {
  return ((a.vendor_group_sort_order ?? 9999) - (b.vendor_group_sort_order ?? 9999))
    || (a.vendor_group ?? '').localeCompare(b.vendor_group ?? '', 'zh-Hant')
    || ((a.sort_order ?? 1000) - (b.sort_order ?? 1000))
    || a.name.localeCompare(b.name, 'zh-Hant')
}

/**
 * 從 mappings 撈出該店的品項清單，附帶完整的 vg / doc_type / category / sort_order
 * 優先序：store-specific mapping > global mapping
 */
async function loadStoreItemsFromMappings(storeId: string): Promise<ResolvedStoreItem[]> {
  const admin = createAdminClient()
  const [mappings, { data: vgs }] = await Promise.all([
    // 分頁撈：避免 PostgREST 1000 max-rows 截斷
    fetchAllPaged<any>(() => admin
      .from('item_column_mappings')
      .select('id,item_name,item_category,vendor_group,doc_type_override,sort_order,vg_sort_order,store_id,is_refund')
      .or(`store_id.is.null,store_id.eq.${storeId}`)),
    admin.from('system_vendor_groups').select('id, name, doc_type, sort_order, tax_mode, merge_across_category').eq('active', true),
  ])

  const vgByName = new Map<string, any>((vgs ?? []).map((v: any) => [v.name as string, v]))

  // 依「store-specific > global」merge：同 item_name 若有 store mapping 就用它，否則用 global
  const byName = new Map<string, any>()
  for (const m of mappings ?? []) {
    const existing = byName.get(m.item_name)
    // store-specific 優先
    if (!existing || (m.store_id === storeId && existing.store_id !== storeId)) {
      byName.set(m.item_name, m)
    }
  }

  const items: ResolvedStoreItem[] = []
  for (const m of byName.values()) {
    const vgName = (m.vendor_group ?? '未分類') as string
    const vg = vgByName.get(vgName) ?? null

    // xlsx 單據類型規則：
    // 1. 品項有明確選單據類型 → 用品項設定
    // 2. 品項未選 → 繼承該分類/廠商群組的單據類型
    // 3. 分類也未設定 → 空白
    // 不再 fallback 到 system_items/store_items 的舊預設，避免「其他」被補成發票。
    const effectiveDocType = (m.doc_type_override ?? vg?.doc_type ?? null) as string | null

    items.push({
      id: m.id as string,
      name: m.item_name as string,
      category: (m.item_category ?? '雜項') as ResolvedStoreItem['category'],
      vendor_group: vgName,
      vendor_group_id: vg?.id ?? null,
      doc_type: effectiveDocType,
      vendor_group_sort_order: (m.vg_sort_order ?? vg?.sort_order ?? 9999) as number,
      tax_mode: ((vg?.tax_mode ?? 'inclusive') as 'inclusive' | 'free'),
      is_system: true,
      sort_order: (m.sort_order ?? 1000) as number,
      vg_merge_across_category: !!vg?.merge_across_category,
      is_refund: !!m.is_refund,
    })
  }

  // 對齊「品項對應管理」：廠商/分類排序優先，廠商內再依品項排序。
  return items.sort(compareResolvedItemsByMappingOrder)
}

export async function getStoreItemsFromMappings(storeId: string): Promise<ResolvedStoreItem[]> {
  return unstable_cache(
    () => loadStoreItemsFromMappings(storeId),
    ['mapping-based-items', storeId],
    { revalidate: 300, tags: ['item-mappings'] }
  )()
}
