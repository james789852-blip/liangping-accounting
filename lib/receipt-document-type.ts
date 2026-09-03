export type ReceiptDocumentTypeMapping = {
  id: string
  store_id: string
  item_name: string
  vendor_group?: string | null
  doc_type_override?: string | null
}

export type ReceiptDocumentTypeItem = {
  item_name?: string | null
  item_mapping_id?: string | null
  vendor_group_snapshot?: string | null
}

export type ReceiptDocumentTypeInput = {
  store_id: string
  vendor_name?: string | null
  actual_vendor_name?: string | null
  receipt_items?: ReceiptDocumentTypeItem[] | null
}

function compact(value?: string | null): string {
  return String(value ?? '').replace(/[\s　]/g, '')
}

function itemNameCompatibilityKey(value?: string | null): string {
  const key = String(value ?? '').replace(/[\s　()（）\-－—–_]/g, '').trim()
  if (['與分店購買食材', '跟分店購買食材', '跟分店買食材'].includes(key)) return '與分店買食材'
  if (key === '油蔥酥' || key === '油蔥') return '油蔥'
  return key
}

/**
 * 取得總公司核對時要顯示的「品項管理設定單據類型」。
 *
 * 比對順序與報表一致：mapping id > 分類快照＋品名 > 可唯一判斷的舊品名。
 * 同名品項若無法唯一判斷就不猜，避免把其他廠商的設定顯示在這張單據上。
 */
export function resolveReceiptDocumentTypeInfo(
  receipt: ReceiptDocumentTypeInput,
  allMappings: ReceiptDocumentTypeMapping[],
) {
  const mappings = allMappings
    .filter(mapping => mapping.store_id === receipt.store_id)
    .map(mapping => ({
      ...mapping,
      name: mapping.item_name,
      mapping_id: mapping.id,
    }))
  const receiptItems = receipt.receipt_items ?? []
  const resolvedMappings: typeof mappings = []

  for (const item of receiptItems) {
    const itemName = item.item_name?.trim() ?? ''
    if (!itemName) continue

    let resolved = item.item_mapping_id
      ? mappings.find(mapping => mapping.id === item.item_mapping_id)
      : undefined
    if (!item.item_mapping_id) {
      const compatible = mappings.filter(mapping =>
        itemNameCompatibilityKey(mapping.name) === itemNameCompatibilityKey(itemName)
        && (!item.vendor_group_snapshot || mapping.vendor_group === item.vendor_group_snapshot),
      )
      if (compatible.length === 1) resolved = compatible[0]
    }

    // 更舊的帳目尚未保存 mapping id／分類快照。只有品名在該店唯一，或能由
    // 收據分類明確縮小到一筆時才採用；禁止同名時任選第一筆。
    if (!resolved && !item.item_mapping_id && !item.vendor_group_snapshot) {
      const candidates = mappings.filter(mapping =>
        itemNameCompatibilityKey(mapping.name) === itemNameCompatibilityKey(itemName),
      )
      if (candidates.length === 1) {
        resolved = candidates[0]
      } else {
        const vendorName = compact(receipt.vendor_name)
        const byVendor = candidates.filter(mapping => compact(mapping.vendor_group) === vendorName)
        if (byVendor.length === 1) resolved = byVendor[0]
      }
    }

    if (resolved && !resolvedMappings.some(mapping => mapping.id === resolved.id)) {
      resolvedMappings.push(resolved)
    }
  }

  // 沒有品項明細（或舊資料無法對到品項）時，若整個廠商分類只有一種正式
  // 單據類型，仍可安全顯示該分類設定。
  if (resolvedMappings.length === 0 && receipt.vendor_name) {
    const vendorName = compact(receipt.vendor_name)
    const vendorMappings = mappings.filter(mapping => compact(mapping.vendor_group) === vendorName)
    const vendorDocTypes = new Set(vendorMappings
      .map(mapping => mapping.doc_type_override?.trim())
      .filter((value): value is string => !!value))
    if (vendorMappings.length > 0 && vendorDocTypes.size === 1) {
      resolvedMappings.push(...vendorMappings)
    }
  }

  const expectedDocumentTypes = [...new Set(resolvedMappings
    .map(mapping => mapping.doc_type_override?.trim())
    .filter((value): value is string => !!value))]
  const configuredVendorGroups = [...new Set(resolvedMappings
    .map(mapping => mapping.vendor_group?.trim())
    .filter((value): value is string => !!value))]

  return {
    expectedDocumentTypes,
    configuredVendorGroups,
  }
}
