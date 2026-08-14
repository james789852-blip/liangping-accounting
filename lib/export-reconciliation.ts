export type ExportReconciliationInput = {
  actual: number
  centralKitchen: number
  onsite: number
  itemizedCost: number
  storedVariance: number | null
}

export type HistoricalExcelLedgerInput = {
  pos: number
  platformAmounts: number[]
  actual: number
  centralKitchen: number
  itemizedCost: number
}

/**
 * 舊版人工 Excel 每日列的固定公式。
 *
 * 這個函式刻意只接受帳本原始欄位，讓 tests/fixtures 裡的歷史案例能成為
 * 獨立標準，而不是拿系統匯出的結果反過來驗證系統自己。
 */
export function deriveHistoricalExcelLedgerRow(input: HistoricalExcelLedgerInput) {
  const platformTotal = input.platformAmounts.reduce((sum, amount) => sum + amount, 0)
  const onsite = input.pos - platformTotal
  const afterDeduct = onsite - input.itemizedCost
  const variance = input.actual - afterDeduct - input.centralKitchen
  const revenueCandidate = onsite + variance

  return {
    platformTotal,
    afterDeduct,
    onsite,
    variance,
    revenue: revenueCandidate > 0 ? revenueCandidate : 0,
  }
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

  const historical = deriveHistoricalExcelLedgerRow({
    pos: input.onsite,
    platformAmounts: [],
    actual: input.actual,
    centralKitchen: input.centralKitchen,
    itemizedCost: input.itemizedCost,
  })
  return {
    variance: historical.variance,
    afterDeduct: historical.afterDeduct,
  }
}

type ExportItemCandidate = {
  id?: string
  mapping_id?: string
  name: string
  vendor_group?: string | null
}

/**
 * 帳目品項的正式識別順序：mapping id > 分類快照 + 品名。
 * 若同名候選仍超過一筆就回傳 undefined，禁止猜第一筆。
 */
export function resolveScopedItemIdentity<T extends ExportItemCandidate>(
  input: {
    mappingId?: string | null
    vendorGroup?: string | null
    itemName: string
  },
  candidates: T[],
  compatibilityKey: (value: string | null | undefined) => string,
): T | undefined {
  if (input.mappingId) {
    const byId = candidates.find(candidate =>
      candidate.mapping_id === input.mappingId || candidate.id === input.mappingId,
    )
    if (byId && (!input.vendorGroup || byId.vendor_group === input.vendorGroup)) return byId
    return undefined
  }

  const compatible = candidates.filter(candidate =>
    compatibilityKey(candidate.name) === compatibilityKey(input.itemName)
    && (!input.vendorGroup || candidate.vendor_group === input.vendorGroup),
  )
  return compatible.length === 1 ? compatible[0] : undefined
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
