/**
 * Returns the current business date in Taiwan time (UTC+8).
 * Before 05:00 AM is still considered the previous day's business.
 */
export function getBusinessDate(): string {
  const nowTW = new Date(Date.now() + 8 * 3600000)
  if (nowTW.getUTCHours() < 5) {
    nowTW.setUTCDate(nowTW.getUTCDate() - 1)
  }
  return nowTW.toISOString().slice(0, 10)
}

/**
 * Returns the last calendar day of the given year-month as 'YYYY-MM-DD'.
 * Timezone-safe: builds the string directly to avoid toISOString() shifting the date
 * by one day depending on server TZ (UTC vs Asia/Taipei).
 */
export function getMonthLastDay(year: number, monthNum: number): string {
  const lastDayNum = new Date(year, monthNum, 0).getDate()
  return `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`
}
