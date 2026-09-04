/**
 * 央廚的「廠商」分類會把品項名稱當成實際廠商名稱。
 * 其他分類的品項不是廠商，不應混進廠商統計。
 */
export function resolveCentralKitchenStatisticsVendor(
  receiptCategory: string | null | undefined,
  itemName: string | null | undefined,
): string {
  if (receiptCategory?.trim() !== '廠商') return ''
  return itemName?.trim() || '未指定廠商'
}
