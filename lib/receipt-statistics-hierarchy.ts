export type ReceiptStatisticsCategory = {
  id: string
  store_id: string
  name: string
  sort_order?: number | null
}

export type ReceiptStatisticsVendor = {
  store_id: string
  category_id: string
  name: string
}

export type ReceiptStatisticsMapping = {
  store_id?: string | null
  item_name?: string | null
  vendor_group?: string | null
  is_tax_addon?: boolean | null
}

export type ReceiptStatisticsHierarchy = {
  categoryByVendor: Map<string, string>
  categoryOrder: Map<string, number>
}

const key = (storeId: string, name: string) => `${storeId}|${name.trim()}`

/**
 * 統計中心與收據管理共用同一層級：
 * 收據大類別（廠商）→ 子類別（菜商／免洗）→ 實際廠商明細。
 */
export function buildReceiptStatisticsHierarchy(
  categories: ReceiptStatisticsCategory[],
  vendors: ReceiptStatisticsVendor[],
  mappings: ReceiptStatisticsMapping[],
): ReceiptStatisticsHierarchy {
  const categoryById = new Map(categories.map(category => [category.id, category] as const))
  const categoryNamesByStore = new Map<string, Set<string>>()
  const categoryByVendor = new Map<string, string>()
  const categoryOrder = new Map<string, number>()

  for (const category of categories) {
    const name = category.name.trim()
    if (!name) continue
    const names = categoryNamesByStore.get(category.store_id) ?? new Set<string>()
    names.add(name)
    categoryNamesByStore.set(category.store_id, names)
    categoryByVendor.set(key(category.store_id, name), name)
    categoryOrder.set(key(category.store_id, name), category.sort_order ?? 999999)
  }

  // 收據管理實際設定的子類別優先，這是菜商、雜貨、免洗等正式歸屬。
  for (const vendor of vendors) {
    const category = categoryById.get(vendor.category_id)
    const vendorName = vendor.name.trim()
    if (!category || !vendorName) continue
    categoryByVendor.set(key(vendor.store_id, vendorName), category.name.trim())
  }

  // 品項管理連動類別（日常用品、貨車保養等）的品項不一定寫入 receipt_vendors，
  // 依「同名收據大類別＋mapping vendor_group」補足它們的層級。
  for (const mapping of mappings) {
    if (!mapping.store_id || mapping.is_tax_addon) continue
    const group = (mapping.vendor_group ?? '').trim()
    const itemName = (mapping.item_name ?? '').trim()
    if (!group || !itemName || group === '廠商') continue
    if (categoryNamesByStore.get(mapping.store_id)?.has(group)) {
      const itemKey = key(mapping.store_id, itemName)
      if (!categoryByVendor.has(itemKey)) categoryByVendor.set(itemKey, group)
    }
  }

  return { categoryByVendor, categoryOrder }
}

export function resolveReceiptStatisticsCategory(
  hierarchy: ReceiptStatisticsHierarchy,
  storeId: string,
  vendorName: string | null | undefined,
): string {
  const name = (vendorName ?? '').trim()
  if (!name) return '未分類'
  return hierarchy.categoryByVendor.get(key(storeId, name)) ?? '未分類'
}

export function receiptStatisticsCategoryOrder(
  hierarchy: ReceiptStatisticsHierarchy,
  storeId: string,
  categoryName: string,
): number {
  return hierarchy.categoryOrder.get(key(storeId, categoryName)) ?? 999999
}
