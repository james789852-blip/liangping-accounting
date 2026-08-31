export interface LinkedReceiptCategory {
  id: string
  name: string
  vendors: { id: string; name: string }[]
}

export interface LinkedReceiptMapping {
  item_name?: string | null
  vendor_group?: string | null
  is_tax_addon?: boolean | null
}

export const MISC_VENDOR_GROUP = '雜項'
export const LEGACY_MISC_VENDOR_GROUP = '未分類'

/** 將舊的空白／未分類名稱統一成畫面與新資料使用的「雜項」。 */
export function normalizeVendorGroupName(value?: string | null): string {
  const name = String(value ?? '').trim()
  return !name || name === LEGACY_MISC_VENDOR_GROUP ? MISC_VENDOR_GROUP : name
}

/** 舊資料相容：空白、未分類與雜項都屬於同一個雜項分類。 */
export function isMiscVendorGroup(value?: string | null): boolean {
  return normalizeVendorGroupName(value) === MISC_VENDOR_GROUP
}

export const STORE_LINKED_RECEIPT_CATEGORY_NAMES = [
  '買東西或維修',
  '日常用品',
  '其他',
  '退稅',
  '雜項',
] as const

export const CK_LINKED_RECEIPT_CATEGORY_NAMES = [
  '買東西或維修',
  '日常用品',
  '加油或停車',
  '貨車相關保養',
  '退稅',
  '雜項',
] as const

/**
 * 這些分類是收據管理的獨立大類別，不應被收進「廠商」底下。
 * 其餘品項群組（例如菜商、雜貨、免洗、雞肉商）皆視為廠商子類別。
 */
export const RECEIPT_VENDOR_GROUP_EXCLUDED_NAMES = [
  ...new Set([
    ...STORE_LINKED_RECEIPT_CATEGORY_NAMES,
    ...CK_LINKED_RECEIPT_CATEGORY_NAMES,
    '央廚配送',
    '廠商',
  ]),
] as const

/** 從品項管理找出應顯示在「廠商」底下的群組。 */
export function resolveReceiptVendorGroupNames(
  mappings: LinkedReceiptMapping[],
  directCategoryNames: readonly string[] = [],
): string[] {
  const excluded = new Set([
    ...RECEIPT_VENDOR_GROUP_EXCLUDED_NAMES,
    ...directCategoryNames.map(name => normalizeVendorGroupName(name)),
  ])
  const names: string[] = []

  for (const mapping of mappings) {
    if (mapping.is_tax_addon) continue
    const name = normalizeVendorGroupName(mapping.vendor_group)
    if (isMiscVendorGroup(name) || excluded.has(name) || names.includes(name)) continue
    names.push(name)
  }

  return names
}

/**
 * 除了系統既有的連動類別，也把「收據類別名稱與品項管理分類相同」的類別視為連動。
 * 這讓管理者在品項管理改名後，不必再維護一份固定名稱清單。
 */
export function resolveLinkedReceiptCategoryNames(
  categories: LinkedReceiptCategory[],
  defaultNames: readonly string[],
  mappings: LinkedReceiptMapping[],
  configuredGroupNames: readonly string[] = [],
): string[] {
  const defaults = new Set(defaultNames)
  const mappedGroups = new Set(
    [
      ...mappings.map(mapping => normalizeVendorGroupName(mapping.vendor_group)),
      ...configuredGroupNames.map(name => normalizeVendorGroupName(name)),
    ],
  )

  return categories
    .map(category => category.name)
    .filter(name => defaults.has(name) || mappedGroups.has(name))
}

/**
 * 舊據點可能早於「獨立類別待同步」標記建立，資料庫只有品項群組、沒有 -2 類別列。
 * 從既有品項辨識系統預設的獨立類別，讓它們仍會出現在收據管理的同步選單。
 */
export function resolveDefaultLinkableReceiptCategoryNames(
  mappings: LinkedReceiptMapping[],
  defaultNames: readonly string[],
  visibleCategoryNames: readonly string[] = [],
): string[] {
  const defaults = new Set(defaultNames.map(name => normalizeVendorGroupName(name)))
  const visible = new Set(visibleCategoryNames.map(name => normalizeVendorGroupName(name)))
  const names: string[] = []

  for (const mapping of mappings) {
    if (mapping.is_tax_addon) continue
    const name = normalizeVendorGroupName(mapping.vendor_group)
    if (!defaults.has(name) || visible.has(name) || names.includes(name)) continue
    names.push(name)
  }

  return names
}

/** 在收據設定畫面中，以品項管理內容取代指定類別的舊廠商清單。 */
export function applyLinkedReceiptCategory(
  categories: LinkedReceiptCategory[],
  categoryName: string,
  mappings: LinkedReceiptMapping[],
): LinkedReceiptCategory[] {
  const names = Array.from(new Set(
    mappings
      .map(mapping => String(mapping.item_name ?? '').trim())
      .filter(Boolean),
  ))

  return categories.map(category => category.name === categoryName
    ? {
        ...category,
        vendors: names.map((name, index) => ({
          id: `linked-item:${index}:${name}`,
          name,
        })),
      }
    : category)
}

/** 將指定收據類別完整換成同店、同分類的品項管理內容。 */
export function applyLinkedReceiptCategories(
  categories: LinkedReceiptCategory[],
  categoryNames: readonly string[],
  mappings: LinkedReceiptMapping[],
): LinkedReceiptCategory[] {
  const linkedNames = new Set(categoryNames)
  const namesByGroup = new Map<string, string[]>()

  for (const mapping of mappings) {
    const group = normalizeVendorGroupName(mapping.vendor_group)
    if (!linkedNames.has(group)) continue
    const name = String(mapping.item_name ?? '').trim()
    if (!name) continue
    const names = namesByGroup.get(group) ?? []
    if (!names.includes(name)) names.push(name)
    namesByGroup.set(group, names)
  }

  return categories.map(category => {
    if (!linkedNames.has(category.name)) return category
    const names = namesByGroup.get(category.name) ?? []
    return {
      ...category,
      vendors: names.map((name, index) => ({
        id: `linked-item:${category.name}:${index}:${name}`,
        name,
      })),
    }
  })
}
