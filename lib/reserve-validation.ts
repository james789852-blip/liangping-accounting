type ReserveRow = {
  reason?: unknown
  amount?: unknown
  total_bill?: unknown
}

/** 新建立的預留款必須保存整張帳單金額，後續日期才能可靠承接與核銷。 */
export function reserveSubmissionError(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as ReserveRow
    const amount = Number(row.amount) || 0
    if (amount <= 0) continue
    const reason = typeof row.reason === 'string' && row.reason.trim() ? row.reason.trim() : '預留款'
    const totalBill = Number(row.total_bill) || 0
    if (totalBill <= 0) return `預留款「${reason}」尚未填寫帳單總金額`
    if (amount > totalBill) return `預留款「${reason}」的今日金額不能超過帳單總金額`
  }

  return null
}
