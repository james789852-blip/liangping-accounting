/**
 * 品項改名只能同步到該來源真正會產生的歷史明細。
 * 一般廠商品項來自收據；央廚配送品項來自每日結帳叫貨。
 */
export function historicalItemSyncTargets(vendorGroup?: string | null) {
  const normalized = (vendorGroup ?? '').trim()
  const isCentralKitchen = normalized === '央廚配送' || normalized === '央廚'
  return {
    receiptItems: !isCentralKitchen,
    orderItems: isCentralKitchen,
  }
}
