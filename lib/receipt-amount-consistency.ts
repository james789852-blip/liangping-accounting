export interface ReceiptAmountItem {
  item_name: string
  amount: number
}

/**
 * 單一品項的金額必須永遠跟單據未稅總額一致。
 *
 * 店長修改單據總額時，舊品項金額可能仍保留編輯前的數字；若只有一個
 * 非稅金品項，沒有任何分攤歧義，可安全以單據總額覆寫。多品項則保留
 * 使用者逐項輸入，避免擅自把差額分配到任一品項。
 */
export function syncSingleReceiptItemAmount<T extends ReceiptAmountItem>(
  items: T[],
  totalAmount: number,
  taxAmount = 0,
): T[] {
  const validItems = items.filter(item => item.item_name.trim())
  const normalizedTax = Number(taxAmount) || 0
  const nonTaxItems = normalizedTax > 0
    ? validItems.filter(item => {
        const name = item.item_name.replace(/[\s　]/g, '')
        return !(Number(item.amount) === normalizedTax && (name.endsWith('稅金') || name.endsWith('稅')))
      })
    : validItems
  if (nonTaxItems.length !== 1) return validItems

  const target = nonTaxItems[0]
  const untaxedTotal = Math.round((Number(totalAmount) || 0) - normalizedTax)
  return validItems.map(item => item === target ? { ...item, amount: untaxedTotal } : item)
}
