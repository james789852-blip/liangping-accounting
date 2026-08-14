export type ExportReconciliationInput = {
  actual: number
  centralKitchen: number
  onsite: number
  itemizedCost: number
  storedVariance: number | null
}

/**
 * 已有結帳資料時，系統送出當下儲存的 variance 是審核依據。
 * Excel 不得因品項 mapping 暫時缺漏而重新算出另一個誤差。
 */
export function deriveExportReconciliation(input: ExportReconciliationInput) {
  if (input.storedVariance !== null && Number.isFinite(input.storedVariance)) {
    const variance = input.storedVariance
    return {
      variance,
      afterDeduct: input.actual - input.centralKitchen - variance,
    }
  }

  const afterDeduct = input.onsite - input.itemizedCost
  return {
    variance: input.actual - afterDeduct - input.centralKitchen,
    afterDeduct,
  }
}

type ExportItemCandidate = {
  name: string
  vendor_group?: string | null
}

/**
 * daily_closings.order_items 是央廚叫貨單的明細，因此來源分類永遠是
 *「央廚配送」。歷史資料可能把央廚品項存成一般廠商欄位的完整名稱
 *（例如「上逸-滷肉」），這裡只借該 mapping 拆回品項本名，再到央廚
 * mapping 內找對應欄位；絕不把央廚金額送到一般廠商分類。
 */
export function resolveCentralKitchenOrderTarget(
  rawName: string,
  allItems: ExportItemCandidate[],
  compatibilityKey: (value: string | null | undefined) => string,
): { itemName: string; vendorGroup: '央廚配送' } {
  const rawKey = compatibilityKey(rawName)
  const centralKitchenItems = allItems.filter(item => item.vendor_group === '央廚配送')

  const directCentralKitchen = centralKitchenItems.find(item => compatibilityKey(item.name) === rawKey)
  if (directCentralKitchen) {
    return { itemName: directCentralKitchen.name, vendorGroup: '央廚配送' }
  }

  // 若歷史 order_item 名稱直接等於其他廠商的 mapping 名稱，去掉該
  // mapping 的廠商前綴後再尋找央廚欄位。例如：上逸-滷肉 → 滷肉。
  const matchedExternalItem = allItems.find(item =>
    item.vendor_group !== '央廚配送' && compatibilityKey(item.name) === rawKey,
  )
  const externalVendor = matchedExternalItem?.vendor_group?.trim()
  if (externalVendor) {
    const escapedVendor = externalVendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const baseName = rawName.replace(new RegExp(`^${escapedVendor}[\\s　\\-－—–_]*`), '').trim()
    if (baseName && baseName !== rawName) {
      const baseKey = compatibilityKey(baseName)
      const centralKitchenByBaseName = centralKitchenItems.find(item => compatibilityKey(item.name) === baseKey)
      if (centralKitchenByBaseName) {
        return { itemName: centralKitchenByBaseName.name, vendorGroup: '央廚配送' }
      }
    }
  }

  // 尚未建立央廚 mapping 時也保留央廚來源，不能 fallback 到其他廠商。
  return { itemName: rawName, vendorGroup: '央廚配送' }
}
