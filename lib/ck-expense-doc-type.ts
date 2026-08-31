export interface CentralKitchenExpenseMapping {
  vendor_group?: string | null
  name?: string | null
  item_name?: string | null
  doc_type?: string | null
  doc_type_override?: string | null
}

function compact(value?: string | null): string {
  return String(value ?? '').replace(/[\s　]/g, '')
}

function mappingItemName(mapping: CentralKitchenExpenseMapping): string {
  return compact(mapping.name ?? mapping.item_name)
}

function mappingDocType(mapping: CentralKitchenExpenseMapping): string {
  return String(mapping.doc_type ?? mapping.doc_type_override ?? '').trim()
}

function uniqueDocType(mappings: CentralKitchenExpenseMapping[]): string | null {
  const docTypes = new Set(mappings.map(mappingDocType).filter(Boolean))
  return docTypes.size === 1 ? Array.from(docTypes)[0] : null
}

/**
 * Resolve the document type used by central-kitchen exports and saved expenses.
 *
 * When an operator records only a vendor and amount, the UI stores the vendor
 * name as a synthetic item (for example, 菜商 / 菜商). That fallback must inherit
 * the vendor's configured item document type instead of the form's default
 * 發票 value. Mixed-document vendors remain unchanged because there is no safe
 * single type to infer without an explicit item.
 */
export function resolveCentralKitchenExpenseDocType(input: {
  vendorGroup?: string | null
  itemName?: string | null
  storedDocType?: string | null
  mappings: CentralKitchenExpenseMapping[]
}): string {
  const vendor = compact(input.vendorGroup)
  const item = compact(input.itemName)
  const stored = String(input.storedDocType ?? '').trim()

  const vendorMappings = input.mappings.filter(mapping =>
    compact(mapping.vendor_group) === vendor,
  )

  if (item) {
    let exactMappings = vendorMappings.filter(mapping =>
      mappingItemName(mapping) === item,
    )

    // 獎金、雜項等央廚直屬品項不隸屬任何廠商群組。舊帳目可能把品項名稱
    // 同時存進 vendor_group，因此先前只按廠商比對時會漏掉目前的正式設定。
    // 僅在同廠商找不到時，才採用「無廠商群組＋品項名稱完全相同」的設定，
    // 避免同名品項跨廠商互相覆蓋。
    if (exactMappings.length === 0) {
      exactMappings = input.mappings.filter(mapping =>
        !compact(mapping.vendor_group) && mappingItemName(mapping) === item,
      )
    }

    const exactDocType = uniqueDocType(exactMappings)
    if (exactDocType) return exactDocType
    // 品項存在但單據類型刻意留白時，留白也是正式設定；不可再落回表單預設值。
    if (exactMappings.length > 0 && exactMappings.every(mapping => !mappingDocType(mapping))) return ''
  }

  const isVendorFallbackItem = !!vendor && (!item || item === vendor)
  if (isVendorFallbackItem) {
    const vendorDocType = uniqueDocType(vendorMappings)
    if (vendorDocType) return vendorDocType
    // 整個廠商群組都有設定品項但全部留白時，維持「未設定」。
    if (vendorMappings.length > 0 && vendorMappings.every(mapping => !mappingDocType(mapping))) return ''
  }

  return stored
}
