/**
 * 大額支出中由前幾日預留款支付的部分。
 * 這個數字只用於最後包回 HQ 的顯示，不應改寫現金清點、實匯入或誤差。
 */
export function getPreReservedExpenseTotal(value: unknown): number {
  // Supabase 對一對一關聯可能回傳物件，手動查詢則可能是陣列；兩種格式都支援。
  if (value && typeof value === 'object' && !Array.isArray(value) && 'large_expenses' in value) {
    return getPreReservedExpenseTotal((value as { large_expenses?: unknown }).large_expenses)
  }
  if (!Array.isArray(value)) return 0
  let total = 0
  let marked = 0
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as { amount?: unknown; preReserved?: unknown; pre_reserved?: unknown }
    const amount = Math.abs(Number(row.amount) || 0)
    total += amount
    if (row.preReserved === true || row.pre_reserved === true) marked += amount
  }
  return Math.min(total, marked)
}
