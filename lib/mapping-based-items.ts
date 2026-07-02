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

/**
 * 從 mappings 撈出該店的品項清單，附帶完整的 vg / doc_type / category / sort_order
 * 優先序：store-specific mapping > global mapping
 */
export async function getStoreItemsFromMappings(storeId: string): Promise<ResolvedStoreItem[]> {
  const admin = createAdminClient()
  const [mappings, { data: vgs }, sysItems, storeItems] = await Promise.all([
    // 分頁撈：避免 PostgREST 1000 max-rows 截斷
    fetchAllPaged<any>(() => admin.from('item_column_mappings').select('*').or(`store_id.is.null,store_id.eq.${storeId}`)),
    admin.from('system_vendor_groups').select('id, name, doc_type, sort_order, tax_mode, merge_across_category').eq('active', true),
    fetchAllPaged<any>(() => admin.from('system_items').select('id, name, doc_type_override').eq('active', true)),
    fetchAllPaged<any>(() => admin.from('store_items').select('id, system_item_id, doc_type_override, custom_vendor_group_id').eq('store_id', storeId).eq('enabled', true)),
  ])

  const vgByName = new Map<string, any>((vgs ?? []).map((v: any) => [v.name as string, v]))
  const sysByName = new Map<string, any>()
  for (const s of sysItems ?? []) sysByName.set(s.name, s)
  const storeBySysId = new Map<string, any>()
  for (const si of storeItems ?? []) storeBySysId.set(si.system_item_id, si)

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
    const sys = sysByName.get(m.item_name)
    const store = sys ? storeBySysId.get(sys.id) : null

    // doc_type 優先序：store_items.doc_type_override > system_items.doc_type_override > vg.doc_type
    const effectiveDocType = store?.doc_type_override ?? sys?.doc_type_override ?? vg?.doc_type ?? null

    items.push({
      id: m.id as string,
      name: m.item_name as string,
      category: (m.item_category ?? '雜項') as ResolvedStoreItem['category'],
      vendor_group: vgName,
      vendor_group_id: vg?.id ?? null,
      doc_type: effectiveDocType,
      vendor_group_sort_order: (vg?.sort_order ?? 9999) as number,
      tax_mode: ((vg?.tax_mode ?? 'inclusive') as 'inclusive' | 'free'),
      is_system: true,
      sort_order: (m.sort_order ?? 1000) as number,
      vg_merge_across_category: !!vg?.merge_across_category,
      is_refund: !!m.is_refund,
    })
  }

  // 依 sort_order 排（xlsx workbook 內會再依 vg 排一次）
  return items.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}
