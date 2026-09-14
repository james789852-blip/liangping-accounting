/** 2026 年 9 月起才是管理人員正式使用期；更早資料僅供測試／歷史查閱。 */
export const SYSTEM_OVERDUE_TRACKING_START = '2026-09-01'

function taipeiCalendarDate(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function addCalendarDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

/** 新店建立當天不追帳，從隔天第一個營業日才開始產生未送出提醒。 */
export function overdueTrackingStartForStore(
  createdAt?: string | null,
  systemStart = SYSTEM_OVERDUE_TRACKING_START,
) {
  if (!createdAt) return systemStart
  const createdDate = taipeiCalendarDate(createdAt)
  if (!createdDate) return systemStart
  const firstExpectedDate = addCalendarDay(createdDate)
  return firstExpectedDate > systemStart ? firstExpectedDate : systemStart
}

export function shouldTrackStoreAccountingDate(
  businessDate: string,
  createdAt?: string | null,
  systemStart = SYSTEM_OVERDUE_TRACKING_START,
) {
  return businessDate >= overdueTrackingStartForStore(createdAt, systemStart)
}

export type OverdueAccountingStatus = 'not_submitted' | 'review' | 'dispute'

/** 將尚未完成的帳目狀態整理成總公司逾期提醒分類。 */
export function overdueAccountingStatus(status?: string): OverdueAccountingStatus | null {
  if (!status) return 'not_submitted'
  if (status === 'submitted') return 'review'
  if (status === 'disputed') return 'dispute'
  return null
}
