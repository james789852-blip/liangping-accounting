export const SYSTEM_OVERDUE_TRACKING_START = '2026-07-12'

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
