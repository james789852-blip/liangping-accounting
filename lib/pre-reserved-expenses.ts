/**
 * 大額支出中由前幾日預留款支付的部分。
 * 這個數字只用於最後包回 HQ 的顯示，不應改寫現金清點、實匯入或誤差。
 */
export interface PreReservedExpenseHint {
  reason: string
  amount: number
  total_bill?: number
  description?: string
  reference_id?: string
  started_date?: string
}

interface PreReservedExpenseRow {
  description: string
  amount: number
  preReserved?: boolean
  preReservedAmount?: number
  reserveReferenceId?: string
  reserveReason?: string
  reserveLinkSkipped?: boolean
}

function normalizeReserveReason(value: string): string {
  return value.replace(/[\s　]+/g, '').trim().toLowerCase()
}

export function getPreReservedHintReferenceId(hint: PreReservedExpenseHint): string {
  return hint.reference_id
    ?? `legacy:${hint.started_date ?? 'unknown'}:${normalizeReserveReason(hint.reason)}:${Number(hint.total_bill ?? 0)}`
}

function hintMatchesExpense(item: PreReservedExpenseRow, hint: PreReservedExpenseHint): boolean {
  const amount = Math.abs(Number(item.amount) || 0)
  const expectedAmount = Math.abs(Number(hint.total_bill ?? hint.amount) || 0)
  if (amount <= 0 || expectedAmount <= 0 || Math.abs(amount - expectedAmount) > 1) return false

  const description = normalizeReserveReason(item.description)
  const reason = normalizeReserveReason(hint.reason)
  const billDescription = normalizeReserveReason(hint.description ?? '')
  if (!description) return false
  if (billDescription && (description.includes(billDescription) || billDescription.includes(description))) return true
  return reason !== '其他' && (description.includes(reason) || reason.includes(description))
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
    if (item.reserveLinkSkipped || item.amount <= 0) return item

    const explicitHint = item.reserveReferenceId
      ? hints.find(candidate => getPreReservedHintReferenceId(candidate) === item.reserveReferenceId)
      : undefined
    const matchingHints = explicitHint ? [explicitHint] : hints.filter(hint => hintMatchesExpense(item, hint))
    // 名稱／金額只能作為舊資料的保守 fallback；有多個候選時必須由店長明確選擇。
    if (matchingHints.length !== 1) return item

    const hint = matchingHints[0]
    const preReservedAmount = Math.min(
      Math.abs(Number(item.amount) || 0),
      Math.abs(Number(hint.amount) || 0),
    )
    const reserveReferenceId = getPreReservedHintReferenceId(hint)
    if (
      item.preReserved === true
      && item.preReservedAmount === preReservedAmount
      && item.reserveReferenceId === reserveReferenceId
      && item.reserveReason === hint.reason
    ) return item
    return {
      ...item,
      preReserved: true,
      preReservedAmount,
      reserveReferenceId,
      reserveReason: hint.reason,
    }
  })
}

export function getPreReservedExpenseRowAmount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const row = value as {
    amount?: unknown
    preReserved?: unknown
    pre_reserved?: unknown
    preReservedAmount?: unknown
    pre_reserved_amount?: unknown
  }
  if (row.preReserved !== true && row.pre_reserved !== true) return 0
  const amount = Math.abs(Number(row.amount) || 0)
  const linkedAmount = Math.abs(Number(row.preReservedAmount ?? row.pre_reserved_amount) || 0)
  return Math.min(amount, linkedAmount > 0 ? linkedAmount : amount)
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
    const row = item as { amount?: unknown }
    const amount = Math.abs(Number(row.amount) || 0)
    total += amount
    marked += getPreReservedExpenseRowAmount(item)
  }
  return Math.min(total, marked)
}
