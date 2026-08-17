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
 * 尚未補足的預留款。
 */
export function buildReserveHistoryContext(rows: HistoricalClosing[]) {
  type ReserveCycle = {
    reason: string
    total_bill: number
    amount: number
    started_date: string
    last_date: string
  }

  const activeCycles: ReserveCycle[] = []
  const looseHints = new Map<string, ReservedExpenseHint>()
  const normalize = (value: unknown) => String(value ?? '').replace(/[\s　]+/g, '').toLowerCase()

  // 查詢結果為日期倒序；逐日正序處理，讓付款只結清當時尚未支付的
  // 那一期帳單。不能只用「原因＋金額」建立全域已付款標記，否則每月
  // 金額相同的房租會被前一期付款誤判為已結清。
  for (const closing of [...rows].reverse()) {
    const date = closing.business_date
    const expenses = Array.isArray(closing.expense_items) ? closing.expense_items : []

    // 先結清前幾日已建立的預留週期，再處理今天的新預留。同日新建的
    // 預留不會被今天上傳的帳單誤判為已支付。
    for (const expense of expenses) {
      const expenseAmount = Math.abs(Number(expense.amount ?? 0))
      if (expenseAmount <= 0) continue
      const description = normalize(expense.description)
      const candidates = activeCycles
        .map((cycle, index) => {
          const reasonText = normalize(cycle.reason)
          const reasonMatches = reasonText !== '其他' && description.length > 0 && (
            description.includes(reasonText) || reasonText.includes(description)
          )
          return { cycle, index, reasonMatches }
        })
        .filter(({ cycle }) => cycle.started_date < date && expenseAmount >= cycle.total_bill - 1)
        // 同時有多筆未結清帳單時，優先依支出說明配對，再以最早一期為準。
        .sort((a, b) => Number(b.reasonMatches) - Number(a.reasonMatches)
          || a.cycle.started_date.localeCompare(b.cycle.started_date))
      const paidCycle = candidates[0]
      if (paidCycle) activeCycles.splice(paidCycle.index, 1)

      for (const [reason, hint] of looseHints) {
        const reasonText = normalize(reason)
        const reasonMatches = reasonText !== '其他' && description.length > 0 && (
          description.includes(reasonText) || reasonText.includes(description)
        )
        if (reasonMatches && expenseAmount >= hint.amount - 1) looseHints.delete(reason)
      }
    }

    const items = Array.isArray(closing.reserve_items) ? closing.reserve_items : []
    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const totalBill = Number(item.total_bill ?? 0)
      const amount = Math.max(0, Number(item.amount ?? 0))
      if (amount <= 0) continue

      if (totalBill <= 0) {
        const continuation = activeCycles
          .filter(group => group.reason === reason && group.amount < group.total_bill)
          .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
        if (continuation) {
          continuation.amount += amount
          if (date > continuation.last_date) continuation.last_date = date
        } else {
          const hint = looseHints.get(reason)
          if (hint) hint.amount += amount
          else looseHints.set(reason, { reason, amount })
        }
        continue
      }

      const existing = activeCycles
        .filter(cycle => cycle.reason === reason && cycle.total_bill === totalBill && cycle.amount < cycle.total_bill)
        .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
      if (existing) {
        existing.amount += amount
        if (date < existing.started_date) existing.started_date = date
        if (date > existing.last_date) existing.last_date = date
        continue
      }

      // 舊版店長端曾把「前一期尚差金額」存進 total_bill，而非原始帳單總額。
      // 例如第一天 18,655 / 42,709，隔天存成 24,054 / 24,054；若直接建立
      // 新週期，付款時只會核銷其中一筆，之後便永久出現幽靈提醒。
      const legacyContinuation = activeCycles
        .filter(cycle => cycle.reason === reason && cycle.amount < cycle.total_bill)
        .filter(cycle => Math.abs((cycle.total_bill - cycle.amount) - totalBill) <= 1)
        .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
      if (legacyContinuation) {
        legacyContinuation.amount += amount
        if (date > legacyContinuation.last_date) legacyContinuation.last_date = date
        continue
      }

      activeCycles.push({
        reason,
        total_bill: totalBill,
        amount,
        started_date: date,
        last_date: date,
      })
    }
  }

  const pending = activeCycles
    .filter(item => item.total_bill > item.amount)
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

  const reserveExpenseHints = new Map<string, ReservedExpenseHint>(looseHints)
  for (const cycle of activeCycles) {
    const hint = reserveExpenseHints.get(cycle.reason)
    if (hint) {
      hint.amount += cycle.amount
      hint.total_bill = Math.max(hint.total_bill ?? 0, cycle.total_bill)
    } else {
      reserveExpenseHints.set(cycle.reason, {
        reason: cycle.reason,
        amount: cycle.amount,
        total_bill: cycle.total_bill,
      })
    }
  }

  return {
    prevDayReserves,
    preReservedExpenseHints: Array.from(reserveExpenseHints.values()),
  }
}
