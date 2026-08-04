type HistoricalExpense = {
  description?: unknown
  amount?: unknown
}

type HistoricalClosing = {
  business_date: string
  reserve_items?: unknown
  expense_items?: HistoricalExpense[] | null
}

export type PendingReserveContext = {
  business_date: string
  items: Array<{
    reason: string
    amount: number
    total_bill: number
    started_date: string
    remaining_amount: number
  }>
} | null

export type ReservedExpenseHint = {
  reason: string
  amount: number
  total_bill?: number
}

/**
 * 從過往已送出／已審核帳目建立尚未結清的預留款脈絡。
 * 退回修改頁與一般結帳頁必須使用相同規則，否則退回後會看不到前一天
 * 尚未補足的房租預留款。
 */
export function buildReserveHistoryContext(rows: HistoricalClosing[]) {
  const reserveGroups = new Map<string, {
    reason: string
    total_bill: number
    amount: number
    started_date: string
    last_date: string
  }>()
  const reserveExpenseHints = new Map<string, ReservedExpenseHint>()
  const normalize = (value: unknown) => String(value ?? '').replace(/[\s　]+/g, '').toLowerCase()
  const paidReserveKeys = new Set<string>()
  const historicalExpenses = rows.flatMap(closing =>
    (Array.isArray(closing.expense_items) ? closing.expense_items : []).map(expense => ({
      ...expense,
      business_date: closing.business_date,
    })),
  )

  for (const closing of rows) {
    const reserveItems = Array.isArray(closing.reserve_items) ? closing.reserve_items : []
    for (const rawItem of reserveItems) {
      const item = rawItem as Record<string, unknown>
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      const reserveAmount = Math.max(0, Number(item.amount ?? 0))
      if (reserveAmount <= 0) continue
      const reasonText = normalize(reason)
      const paid = historicalExpenses.some(expense => {
        if (expense.business_date < closing.business_date) return false
        const expenseAmount = Math.abs(Number(expense.amount ?? 0))
        if (expenseAmount <= 0) return false
        const description = normalize(expense.description)
        const reasonMatches = reasonText !== '其他' && description.length > 0 && (
          description.includes(reasonText) || reasonText.includes(description)
        )
        const amountMatches = totalBill > 0
          ? expenseAmount >= totalBill - 1
          : expenseAmount >= reserveAmount - 1
        return amountMatches && (reasonMatches || (totalBill > 0 && expenseAmount >= totalBill - 1))
      })
      if (paid) paidReserveKeys.add(`${normalize(reason)}||${totalBill}`)
    }
  }

  // 查詢結果為日期倒序；累計預留必須改用正序。
  for (const closing of [...rows].reverse()) {
    const date = closing.business_date
    const items = Array.isArray(closing.reserve_items) ? closing.reserve_items : []
    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      const amount = Math.max(0, Number(item.amount ?? 0))
      if (amount <= 0) continue
      const reserveKey = `${normalize(reason)}||${totalBill}`
      const alreadyPaid = paidReserveKeys.has(reserveKey)

      if (!alreadyPaid) {
        const hint = reserveExpenseHints.get(reason)
        if (hint) {
          hint.amount += amount
          if (totalBill > 0) hint.total_bill = Math.max(hint.total_bill ?? 0, totalBill)
        } else {
          reserveExpenseHints.set(reason, {
            reason,
            amount,
            ...(totalBill > 0 ? { total_bill: totalBill } : {}),
          })
        }
      }

      if (totalBill <= 0) {
        const continuation = Array.from(reserveGroups.values())
          .filter(group => group.reason === reason && group.amount < group.total_bill)
          .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
        if (continuation) {
          continuation.amount += amount
          if (date > continuation.last_date) continuation.last_date = date
        }
        continue
      }

      const key = `${reason}||${totalBill}`
      const existing = reserveGroups.get(key)
      if (existing) {
        existing.amount += amount
        if (date < existing.started_date) existing.started_date = date
        if (date > existing.last_date) existing.last_date = date
      } else {
        reserveGroups.set(key, {
          reason,
          total_bill: totalBill,
          amount,
          started_date: date,
          last_date: date,
        })
      }
    }
  }

  const pending = Array.from(reserveGroups.values())
    .filter(item => item.total_bill > item.amount && !paidReserveKeys.has(`${normalize(item.reason)}||${item.total_bill}`))
    .sort((a, b) => b.last_date.localeCompare(a.last_date))
  const prevDayReserves: PendingReserveContext = pending.length > 0
    ? {
        business_date: pending[0].last_date,
        items: pending.map(item => ({
          reason: item.reason,
          amount: item.amount,
          total_bill: item.total_bill,
          started_date: item.started_date,
          remaining_amount: item.total_bill - item.amount,
        })),
      }
    : null

  return {
    prevDayReserves,
    preReservedExpenseHints: Array.from(reserveExpenseHints.values()),
  }
}
