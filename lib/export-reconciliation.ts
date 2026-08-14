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

/**
 * 央廚叫貨固定標記為「央廚配送」，但舊店家可能只建立同名的一般 mapping。
 * 若只有一個候選欄位，應落到該欄，不能讓金額從 Excel 明細消失。
 */
export function resolveOrderItemVendorGroup(
  candidates: Array<{ vendor_group?: string | null }>,
): string {
  const centralKitchen = candidates.find(item => item.vendor_group === '央廚配送')
  if (centralKitchen) return '央廚配送'
  if (candidates.length === 1 && candidates[0].vendor_group) return candidates[0].vendor_group
  return '央廚配送'
}
