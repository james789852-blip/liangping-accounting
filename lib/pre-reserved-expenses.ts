/**
 * 大額支出中由前幾日預留款支付的部分。
 * 這個數字只用於最後包回 HQ 的顯示，不應改寫現金清點、實匯入或誤差。
 */
export interface PreReservedExpenseHint {
  reason: string
  amount: number
  total_bill?: number
}

interface PreReservedExpenseRow {
  description: string
  amount: number
  preReserved?: boolean
}

function normalizeReserveReason(value: string): string {
  return value.replace(/[\s　]+/g, '').trim()
}

/**
 * 立即把歷史預留款套用到本日同名、同帳單金額的大額支出。
 *
 * 這是純函式，讓包款畫面在 render 當下就得到正確金額；不能只依賴
 * useEffect 事後補標，否則店長快速進入確認頁時會短暫看到錯誤包款。
 */
export function applyPreReservedExpenseHints<T extends PreReservedExpenseRow>(
  items: readonly T[],
  hints: readonly PreReservedExpenseHint[],
): T[] {
  if (items.length === 0 || hints.length === 0) return [...items]

  return items.map(item => {
    if (item.preReserved === true || item.amount <= 0 || !item.description.trim()) return item
    const reason = normalizeReserveReason(item.description)
    const hint = hints.find(candidate => normalizeReserveReason(candidate.reason) === reason)
    if (!hint) return item
    // 有帳單總額時只套用到同額支出；沒有總額的舊預留資料則以同名為準。
    if (hint.total_bill && Math.abs(Math.abs(item.amount) - hint.total_bill) > 1) return item
    return { ...item, preReserved: true }
  })
}

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
