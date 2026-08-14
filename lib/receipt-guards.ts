export const LOCKED_CLOSING_STATUSES = ['submitted', 'verified'] as const

export function isReceiptDateLocked(status: string | null | undefined): boolean {
  return status === 'submitted' || status === 'verified'
}

export function isIsoBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function lockedReceiptMessage(status: string | null | undefined): string | null {
  if (!isReceiptDateLocked(status)) return null
  return status === 'verified'
    ? '此日期帳目已審核，請先由總公司退回後再修改收據'
    : '此日期帳目已送出，請先退回修改後再變更收據'
}
