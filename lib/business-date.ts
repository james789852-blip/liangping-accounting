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
