export const TAX_EXEMPT_RICE_GROUP = '米（免稅）'

type ReceiptStatisticsItem = {
  item_name?: string | null
  amount?: number | string | null
}

export type ReceiptStatisticsAllocation = {
  group: string
  amount: number
  itemNames: string[]
}

function uniqueItemNames(items: ReceiptStatisticsItem[]) {
  return Array.from(new Set(
    items
      .map(item => String(item.item_name ?? '').trim())
      .filter(Boolean),
  ))
}

/**
 * 店面統計中的「米」是免稅商品：從雜貨淨額拆出後獨立統計。
 * 每個 allocation 的金額加總必須永遠等於原單據總額，避免改變總支出。
 */
export function allocateReceiptStatistics(
  vendorGroup: string | null | undefined,
  totalAmount: number,
  items: ReceiptStatisticsItem[] | null | undefined,
): ReceiptStatisticsAllocation[] {
  const group = String(vendorGroup ?? '').trim() || '未分類'
  const normalizedItems = Array.isArray(items) ? items : []
  const allItemNames = uniqueItemNames(normalizedItems)

  if (group !== '雜貨') return [{ group, amount: totalAmount, itemNames: allItemNames }]

  const riceItems = normalizedItems.filter(item => String(item.item_name ?? '').trim() === '米')
  const riceAmount = riceItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
  if (!Number.isFinite(riceAmount) || riceAmount === 0) {
    return [{ group, amount: totalAmount, itemNames: allItemNames }]
  }

  const nonRiceItems = normalizedItems.filter(item => String(item.item_name ?? '').trim() !== '米')
  const allocations: ReceiptStatisticsAllocation[] = []
  const groceryAmount = totalAmount - riceAmount

  if (groceryAmount !== 0) {
    allocations.push({ group, amount: groceryAmount, itemNames: uniqueItemNames(nonRiceItems) })
  }
  allocations.push({
    group: TAX_EXEMPT_RICE_GROUP,
    amount: riceAmount,
    itemNames: uniqueItemNames(riceItems),
  })
  return allocations
}
