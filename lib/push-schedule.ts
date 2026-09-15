export type PushScheduleSettings = {
  accountingFirstTime: string
  accountingFinalTime: string
  ckHandoffTime: string
  returnedReminderMinutes: number
}

export const DEFAULT_PUSH_SCHEDULE_SETTINGS: PushScheduleSettings = {
  accountingFirstTime: '23:00',
  accountingFinalTime: '23:30',
  ckHandoffTime: '17:00',
  returnedReminderMinutes: 60,
}

const FIVE_MINUTE_TIME = /^(?:[01]\d|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$/

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim().slice(0, 5)
  return FIVE_MINUTE_TIME.test(candidate) ? candidate : fallback
}

function clockMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

// 帳務日從 05:00 開始，因此 00:30 仍排在前一晚 23:00 之後。
function businessDayMinutes(value: string) {
  return (clockMinutes(value) - 5 * 60 + 24 * 60) % (24 * 60)
}

export function normalizePushScheduleSettings(value: unknown): PushScheduleSettings {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const returned = Number(row.returnedReminderMinutes ?? row.returned_reminder_minutes)
  return {
    accountingFirstTime: normalizeTime(
      row.accountingFirstTime ?? row.accounting_first_time,
      DEFAULT_PUSH_SCHEDULE_SETTINGS.accountingFirstTime,
    ),
    accountingFinalTime: normalizeTime(
      row.accountingFinalTime ?? row.accounting_final_time,
      DEFAULT_PUSH_SCHEDULE_SETTINGS.accountingFinalTime,
    ),
    ckHandoffTime: normalizeTime(
      row.ckHandoffTime ?? row.ck_handoff_time,
      DEFAULT_PUSH_SCHEDULE_SETTINGS.ckHandoffTime,
    ),
    returnedReminderMinutes: Number.isInteger(returned) && returned >= 15 && returned <= 1440 && returned % 15 === 0
      ? returned
      : DEFAULT_PUSH_SCHEDULE_SETTINGS.returnedReminderMinutes,
  }
}

export function validatePushScheduleSettings(value: unknown):
  | { settings: PushScheduleSettings; error?: never }
  | { settings?: never; error: string } {
  if (!value || typeof value !== 'object') return { error: '推播時間格式錯誤' }
  const row = value as Record<string, unknown>
  const rawTimes = [row.accountingFirstTime, row.accountingFinalTime, row.ckHandoffTime]
  if (rawTimes.some(time => typeof time !== 'string' || !FIVE_MINUTE_TIME.test(time))) {
    return { error: '時間必須以 5 分鐘為單位' }
  }
  const returned = Number(row.returnedReminderMinutes)
  if (!Number.isInteger(returned) || returned < 15 || returned > 1440 || returned % 15 !== 0) {
    return { error: '退回提醒必須設定為 15～1440 分鐘，並以 15 分鐘為單位' }
  }

  const settings = normalizePushScheduleSettings(value)
  if (businessDayMinutes(settings.accountingFinalTime) <= businessDayMinutes(settings.accountingFirstTime)) {
    return { error: '第二次未送出提醒必須晚於第一次提醒' }
  }
  return { settings }
}

export function getTaipeiClockTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

/** Vercel 每 5 分鐘觸發一次；同一個五分鐘時段內都視為到點。 */
export function isPushScheduleDue(scheduledTime: string, now = new Date()) {
  const current = clockMinutes(getTaipeiClockTime(now))
  return Math.floor(current / 5) * 5 === clockMinutes(scheduledTime)
}

export function formatReminderDelay(minutes: number) {
  if (minutes < 60) return `${minutes} 分鐘`
  if (minutes % 60 === 0) return `${minutes / 60} 小時`
  return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分鐘`
}
