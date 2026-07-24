/**
 * 稅外加品項的套用規則：
 * - 「水-稅金」這類名稱，若收據選到原始品項「水」，只套用該品項。
 * - 「免洗-稅金」這類沒有對應原始品項的名稱，視為整個廠商分類的稅金。
 */

export interface TaxAddonMappingLike {
  name: string
  vendor_group?: string | null
  is_tax_addon?: boolean
  tax_scope?: 'category' | 'item' | null
  tax_target_item?: string | null
}

export function taxAddonBaseName(name: string): string {
  return name.trim()
    .replace(/\s*[-－—]\s*(?:稅金|稅)\s*$/u, '')
    .replace(/\s*(?:稅金|稅)\s*$/u, '')
    .trim()
}

export function isItemSpecificTaxAddon<T extends TaxAddonMappingLike>(
  column: T,
  mappings: T[],
): boolean {
  const baseName = taxAddonBaseName(column.name)
  if (!baseName || baseName === column.name.trim() || !column.vendor_group) return false
  if (column.tax_scope === 'category') return false
  if (column.tax_scope === 'item') return true
  // 「免洗-稅金」這種前綴就是分類名稱時，固定視為整個分類，
  // 即使未來剛好也新增了一個名為「免洗」的品項，仍不會縮小套用範圍。
  if (baseName === column.vendor_group.trim()) return false
  return mappings.some(candidate =>
    !candidate.is_tax_addon
    && candidate.name.trim() === baseName
    && candidate.vendor_group === column.vendor_group,
  )
}

export function findTaxAddonMapping<T extends TaxAddonMappingLike>(
  mappings: T[],
  groups: Iterable<string>,
  selectedItemNames: Iterable<string>,
): T | undefined {
  const groupSet = new Set(Array.from(groups, group => group.trim()).filter(Boolean))
  const selectedNames = new Set(Array.from(selectedItemNames, name => name.trim()).filter(Boolean))
  const candidates = mappings.filter(column =>
    column.is_tax_addon && !!column.vendor_group && groupSet.has(column.vendor_group),
  )

  const itemTaxAddon = candidates.find(column =>
    isItemSpecificTaxAddon(column, mappings)
    && selectedNames.has((column.tax_target_item ?? taxAddonBaseName(column.name)).trim()),
  )
  if (itemTaxAddon) return itemTaxAddon

  return candidates.find(column => !isItemSpecificTaxAddon(column, mappings))
}
