export type VendorMappingLike = {
  item_name?: string | null
  name?: string | null
  excel_column?: string | null
  vendor_group?: string | null
  is_tax_addon?: boolean | null
}

/**
 * 沒有明細品項的廠商，會用一筆「廠商名稱＝品項名稱＝Excel 欄名」的內部對應
 * 保存食材／耗材／雜項分類。這筆資料不是店長需要選擇的明細品項。
 */
export function isVendorOnlyMapping(mapping: VendorMappingLike): boolean {
  const vendorGroup = (mapping.vendor_group ?? '').trim()
  const itemName = (mapping.item_name ?? mapping.name ?? '').trim()
  const excelColumn = (mapping.excel_column ?? '').trim()
  return !!vendorGroup
    && !mapping.is_tax_addon
    && itemName === vendorGroup
    && excelColumn === vendorGroup
}

/** 只有存在真正的子品項時，做帳畫面才需要顯示品項選擇框。 */
export function hasSelectableVendorItems(
  vendorName: string | null | undefined,
  mappings: VendorMappingLike[],
): boolean {
  const vendor = (vendorName ?? '').trim()
  if (!vendor) return false
  return mappings.some(mapping => (
    !mapping.is_tax_addon
    && (mapping.vendor_group ?? '').trim() === vendor
    && !isVendorOnlyMapping(mapping)
  ))
}
