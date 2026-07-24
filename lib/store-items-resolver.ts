// 從新 schema (system_items + store_items + system_vendor_groups) 取得店家「有效啟用品項列表」
// 回傳跟舊 mappingColumns 一樣的格式 → 可直接餵給 closing-form 不用改 UI
import { createAdminClient } from '@/lib/supabase/admin'

export interface ResolvedStoreItem {
  /** 品項唯一識別（store-side：可能是 system_item.id 或 store_item.id） */
  id: string
  /** 顯示名稱（內建用 system_items.name；自訂用 store_items.custom_name） */
  name: string
  /** 食材 / 耗材 / 雜項 */
  category: '食材' | '耗材' | '雜項'
  /** 廠商分類名稱（央廚配送 / 菜商 / ...） */
  vendor_group: string
  /** 廠商分類 ID */
  vendor_group_id: string | null
  /** 該分類對應的單據類型（發票/收據/估價單/公司開）— Excel row 2 用 */
  doc_type: string | null
  /** 該分類在 system_vendor_groups 的 sort_order（給 Excel 匯出排類別用） */
  vendor_group_sort_order: number
  /** 稅務模式：inclusive=含稅可退（÷21）; free=免稅；繼承自 vendor_group.tax_mode */
  tax_mode: 'inclusive' | 'free'
  /** 是否系統品項（false = 店家自訂） */
  is_system: boolean
  /** 排序（store_items.sort_order 或 system_items.sort_order） */
  sort_order: number
  /** vg 是否跨 category 合併顯示 */
  vg_merge_across_category?: boolean
  /** 是否納入梁平退稅總額（跟 vg 解耦，明確標記） */
  is_refund?: boolean
  /** 店長輸入稅外加時由系統自動寫入的隱藏稅金品項 */
  is_tax_addon?: boolean
  /** 稅外加套用範圍：整個廠商分類或指定原始品項 */
  tax_scope?: 'category' | 'item'
  tax_target_item?: string | null
}

/** 撈出某店家「實際啟用的品項列表」(含系統 + 自訂) */
export async function getStoreItemsResolved(storeId: string): Promise<ResolvedStoreItem[]> {
  const admin = createAdminClient()
  const [{ data: vgs }, { data: sysItems }, { data: storeItems }] = await Promise.all([
    admin.from('system_vendor_groups').select('id, name, doc_type, sort_order, tax_mode, merge_across_category').eq('active', true),
    admin.from('system_items').select('*').eq('active', true).order('sort_order'),
    admin.from('store_items').select('*').eq('store_id', storeId).order('sort_order'),
  ])

  const vgMap = new Map((vgs ?? []).map((v: any) => [v.id, {
    name: v.name as string,
    doc_type: (v.doc_type ?? null) as string | null,
    sort_order: (v.sort_order ?? 9999) as number,
    tax_mode: ((v.tax_mode ?? 'inclusive') as 'inclusive' | 'free'),
    merge_across_category: !!v.merge_across_category,
  }]))
  const vgName = (id: string | null | undefined) => id ? (vgMap.get(id)?.name ?? '未分類') : '未分類'
  const vgDoc  = (id: string | null | undefined) => id ? (vgMap.get(id)?.doc_type ?? null) : null
  const vgSort = (id: string | null | undefined) => id ? (vgMap.get(id)?.sort_order ?? 9999) : 9999
  const vgTax  = (id: string | null | undefined): 'inclusive' | 'free' =>
    id ? (vgMap.get(id)?.tax_mode ?? 'inclusive') : 'inclusive'
  const vgMergeFlag = (id: string | null | undefined): boolean =>
    id ? !!vgMap.get(id)?.merge_across_category : false

  // 1) 店家對系統品項的明確啟用/停用設定 + 店家自訂的 sort_order（覆寫 system 預設順序）
  //    + 店家對 vg 的 override（custom_vendor_group_id）
  const sysOverride = new Map<string, { enabled: boolean; sort_order: number | null; custom_vg_id: string | null }>()
  // 2) 店家自訂品項
  const customs: ResolvedStoreItem[] = []
  for (const si of (storeItems ?? []) as any[]) {
    if (si.system_item_id) {
      sysOverride.set(si.system_item_id, {
        enabled: si.enabled,
        sort_order: si.sort_order ?? null,
        custom_vg_id: si.custom_vendor_group_id ?? null,
      })
    } else {
      customs.push({
        id: si.id,
        name: si.custom_name ?? '(未命名)',
        category: (si.custom_category ?? '雜項') as ResolvedStoreItem['category'],
        vendor_group: vgName(si.custom_vendor_group_id),
        vendor_group_id: si.custom_vendor_group_id,
        doc_type: si.doc_type_override ?? vgDoc(si.custom_vendor_group_id),
        vendor_group_sort_order: vgSort(si.custom_vendor_group_id),
        tax_mode: vgTax(si.custom_vendor_group_id),
        is_system: false,
        sort_order: si.sort_order ?? 1000,
        vg_merge_across_category: vgMergeFlag(si.custom_vendor_group_id),
      })
    }
  }

  // 3) 系統品項：以 override 為主，沒設過則用 default_enabled
  //    排序優先用 store_items.sort_order（店家自訂順序），沒設過才用 system_items.sort_order
  const enabledSys: ResolvedStoreItem[] = []
  for (const it of (sysItems ?? []) as any[]) {
    const overridden = sysOverride.get(it.id)
    const enabled = overridden?.enabled !== undefined ? overridden.enabled : it.default_enabled
    if (!enabled) continue
    // vg 優先序：store_items.custom_vendor_group_id > system_items.vendor_group_id
    const effectiveVgId = overridden?.custom_vg_id ?? it.vendor_group_id
    // doc_type 優先序：store_items.doc_type_override > system_items.doc_type_override > vendor_group.doc_type
    const storeOverrideDocType = (storeItems ?? [] as any[]).find((s: any) => s.system_item_id === it.id)?.doc_type_override
    const effectiveDocType = storeOverrideDocType ?? it.doc_type_override ?? vgDoc(effectiveVgId)
    enabledSys.push({
      id: it.id,
      name: it.name,
      category: it.category as ResolvedStoreItem['category'],
      vendor_group: vgName(effectiveVgId),
      vendor_group_id: effectiveVgId,
      doc_type: effectiveDocType,
      vendor_group_sort_order: vgSort(effectiveVgId),
      tax_mode: vgTax(effectiveVgId),
      is_system: true,
      sort_order: overridden?.sort_order ?? it.sort_order ?? 1000,
      vg_merge_across_category: vgMergeFlag(effectiveVgId),
    })
  }

  // 合併 + dedup by name（同名保留第一個，通常是店家 override 或第一個 vg 命中的）
  // 避免 system_items 有多筆同名不同 vg 都 active 造成下拉重複顯示
  const merged = [...enabledSys, ...customs]
  const byName = new Map<string, ResolvedStoreItem>()
  for (const it of merged) {
    if (!byName.has(it.name)) byName.set(it.name, it)
  }
  return [...byName.values()].sort((a, b) => a.sort_order - b.sort_order)
}

/** 把 ResolvedStoreItem[] 轉成 closing-form 期待的 mappingColumns 格式 */
export function toMappingColumns(items: ResolvedStoreItem[]) {
  return items.map(i => ({
    name: i.name,
    category: i.category,
    vendor_group: i.vendor_group,
    // excel_column 在新系統由匯出邏輯動態決定，這裡先填 name 作為過渡
    excel_column: i.name,
    is_tax_addon: !!i.is_tax_addon,
    tax_scope: i.tax_scope ?? 'category',
    tax_target_item: i.tax_target_item ?? null,
  }))
}
