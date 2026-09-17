type HistoricalExpense = {
  description?: unknown
  amount?: unknown
}

type HistoricalCashCount = {
  large_expenses?: unknown
}

type HistoricalClosing = {
  business_date: string
  reserve_items?: unknown
  expense_items?: HistoricalExpense[] | null
  cash_counts?: HistoricalCashCount[] | HistoricalCashCount | null
}

export type PendingReserveContext = {
  business_date: string
  items: Array<{
    reason: string
    description?: string
    amount: number
    total_bill: number
    started_date: string
    remaining_amount: number
    reserve_reference_id: string
  }>
} | null

export type ReservedExpenseHint = {
  reason: string
  description?: string
  amount: number
  total_bill?: number
  reference_id: string
  started_date?: string
}

/**
 * 從過往已送出／已審核帳目建立尚未結清的預留款脈絡。
 * 退回修改頁與一般結帳頁必須使用相同規則，否則退回後會看不到前一天
 * 尚未補足的預留款。
 */
export function buildReserveHistoryContext(rows: HistoricalClosing[]) {
  type ReserveCycle = {
    reason: string
    description?: string
    total_bill: number
    amount: number
    started_date: string
    last_date: string
    reference_id: string
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
    const cashRows = Array.isArray(closing.cash_counts)
      ? closing.cash_counts
      : closing.cash_counts && typeof closing.cash_counts === 'object'
        ? [closing.cash_counts]
        : []
    const preReservedPayments = cashRows.flatMap(row => Array.isArray(row.large_expenses) ? row.large_expenses : [])
      .flatMap(raw => {
        if (!raw || typeof raw !== 'object') return []
        const item = raw as Record<string, unknown>
        const isLinked = item.preReserved === true || item.pre_reserved === true
        const referenceId = typeof item.reserveReferenceId === 'string'
          ? item.reserveReferenceId
          : typeof item.reserve_reference_id === 'string'
            ? item.reserve_reference_id
            : ''
        if (!isLinked) return []
        return [{
          referenceId,
          reason: typeof item.reserveReason === 'string'
            ? item.reserveReason
            : typeof item.reserve_reason === 'string'
              ? item.reserve_reason
              : '',
          description: typeof item.description === 'string' ? item.description : '',
          amount: Math.abs(Number(item.preReservedAmount ?? item.pre_reserved_amount ?? item.amount) || 0),
        }]
      })
    const linkedPayments = preReservedPayments.filter(payment => payment.referenceId)
    const legacyLinkedPayments = preReservedPayments.filter(payment => !payment.referenceId)

    // 新版資料以預留款識別碼核銷，不受「營業稅」／「7–8 月營業稅」等名稱差異影響。
    for (const payment of linkedPayments) {
      const cycleIndex = activeCycles.findIndex(cycle => cycle.reference_id === payment.referenceId)
      if (cycleIndex >= 0) activeCycles.splice(cycleIndex, 1)
      looseHints.delete(payment.referenceId)
    }

    // 舊版資料只有 preReserved 標記，尚未儲存預留款識別碼。這類付款以
    // 「原因／說明＋足額」核銷，避免同日帳單拆成多張收據時，逐張金額
    // 都小於帳單總額而永久留下幽靈提醒。
    for (const payment of legacyLinkedPayments) {
      if (payment.amount <= 0) continue
      const paymentText = normalize(payment.reason || payment.description)
      if (!paymentText) continue

      const candidates = activeCycles
        .map((cycle, index) => {
          const reasonText = normalize(cycle.reason)
          const descriptionText = normalize(cycle.description)
          const textMatches = (reasonText !== '其他' && (
            paymentText.includes(reasonText) || reasonText.includes(paymentText)
          )) || (descriptionText && (
            paymentText.includes(descriptionText) || descriptionText.includes(paymentText)
          ))
          return { cycle, index, textMatches }
        })
        .filter(({ cycle, textMatches }) => textMatches
          && cycle.started_date < date
          && payment.amount >= cycle.total_bill - 1)
        .sort((a, b) => a.cycle.started_date.localeCompare(b.cycle.started_date))
      const paidCycle = candidates[0]
      if (paidCycle) {
        activeCycles.splice(paidCycle.index, 1)
        looseHints.delete(paidCycle.cycle.reference_id)
      }

      for (const [key, hint] of looseHints) {
        const reasonText = normalize(hint.reason)
        const descriptionText = normalize(hint.description)
        const textMatches = (reasonText !== '其他' && (
          paymentText.includes(reasonText) || reasonText.includes(paymentText)
        )) || (descriptionText && (
          paymentText.includes(descriptionText) || descriptionText.includes(paymentText)
        ))
        if (textMatches && payment.amount >= hint.amount - 1) looseHints.delete(key)
      }
    }

    // 先結清前幾日已建立的預留週期，再處理今天的新預留。同日新建的
    // 預留不會被今天上傳的帳單誤判為已支付。
    for (const expense of expenses) {
      const expenseAmount = Math.abs(Number(expense.amount ?? 0))
      if (expenseAmount <= 0) continue
      const description = normalize(expense.description)
      // 已有明確預留款連結的支出不再進入舊版文字 fallback，以免誤核銷另一張同類帳單。
      const linkedPaymentIndex = linkedPayments.findIndex(payment => {
        const reason = normalize(payment.reason)
        const linkedDescription = normalize(payment.description)
        const textMatches = (reason && reason !== '其他' && description.includes(reason))
          || (linkedDescription && (description.includes(linkedDescription) || linkedDescription.includes(description)))
        return Math.abs(payment.amount - expenseAmount) <= 1 && textMatches
      })
      if (linkedPaymentIndex >= 0) {
        linkedPayments.splice(linkedPaymentIndex, 1)
        continue
      }
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

      for (const [key, hint] of looseHints) {
        const reasonText = normalize(hint.reason)
        const reasonMatches = reasonText !== '其他' && description.length > 0 && (
          description.includes(reasonText) || reasonText.includes(description)
        )
        if (reasonMatches && expenseAmount >= hint.amount - 1) looseHints.delete(key)
      }
    }

    const items = Array.isArray(closing.reserve_items) ? closing.reserve_items : []
    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '其他'
      const description = typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : undefined
      const totalBill = Number(item.total_bill ?? 0)
      const amount = Math.max(0, Number(item.amount ?? 0))
      const storedReferenceId = typeof item.reserve_reference_id === 'string' && item.reserve_reference_id
        ? item.reserve_reference_id
        : undefined
      const storedStartDate = typeof item.source_start_date === 'string' && item.source_start_date
        ? item.source_start_date
        : date
      if (amount <= 0) continue

      if (totalBill <= 0) {
        const looseKey = storedReferenceId ?? `legacy-loose:${normalize(reason)}`
        const continuation = activeCycles
          .filter(group => (storedReferenceId && group.reference_id === storedReferenceId)
            || (!storedReferenceId && group.reason === reason && group.amount < group.total_bill))
          .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
        if (continuation) {
          continuation.amount += amount
          if (!continuation.description && description) continuation.description = description
          if (date > continuation.last_date) continuation.last_date = date
        } else {
          const hint = looseHints.get(looseKey)
          if (hint) hint.amount += amount
          else looseHints.set(looseKey, {
            reason,
            description,
            amount,
            reference_id: looseKey,
            started_date: storedStartDate,
          })
        }
        continue
      }

      const existing = activeCycles
        .filter(cycle => storedReferenceId
          ? cycle.reference_id === storedReferenceId
          : cycle.reason === reason && cycle.total_bill === totalBill && cycle.amount < cycle.total_bill)
        .sort((a, b) => b.last_date.localeCompare(a.last_date))[0]
      if (existing) {
        existing.amount += amount
        if (!existing.description && description) existing.description = description
        if (storedStartDate < existing.started_date) existing.started_date = storedStartDate
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
        description,
        total_bill: totalBill,
        amount,
        started_date: storedStartDate,
        last_date: date,
        reference_id: storedReferenceId ?? `legacy:${storedStartDate}:${normalize(reason)}:${totalBill}`,
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
          description: item.description,
          amount: item.amount,
          total_bill: item.total_bill,
          started_date: item.started_date,
          remaining_amount: item.total_bill - item.amount,
          reserve_reference_id: item.reference_id,
        })),
      }
    : null

  const reserveExpenseHints = Array.from(looseHints.values())
  for (const cycle of activeCycles) {
    reserveExpenseHints.push({
      reason: cycle.reason,
      description: cycle.description,
      amount: cycle.amount,
      total_bill: cycle.total_bill,
      reference_id: cycle.reference_id,
      started_date: cycle.started_date,
    })
  }

  return {
    prevDayReserves,
    preReservedExpenseHints: reserveExpenseHints,
  }
}
