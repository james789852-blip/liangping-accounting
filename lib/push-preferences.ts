export const PUSH_PREFERENCE_OPTIONS = [
  { key: 'review_submission', label: '帳目送出待審核', audience: '總公司' },
  { key: 'review_result', label: '審核通過或退回', audience: '店面／央廚' },
  { key: 'accounting_reminder', label: '未送出與退回逾期提醒', audience: '店面／央廚' },
  { key: 'reimbursement_handoff', label: '央廚補款點交', audience: '央廚' },
  { key: 'hq_escalation', label: '總公司逾期追蹤', audience: '總公司' },
] as const

export type PushPreferenceKey = (typeof PUSH_PREFERENCE_OPTIONS)[number]['key']
export type PushPreferences = Record<PushPreferenceKey, boolean>

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  review_submission: true,
  review_result: true,
  accounting_reminder: true,
  reimbursement_handoff: true,
  hq_escalation: true,
}

export function normalizePushPreferences(value: unknown): PushPreferences {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(
    Object.entries(DEFAULT_PUSH_PREFERENCES).map(([key, fallback]) => [key, input[key] === undefined ? fallback : input[key] !== false]),
  ) as PushPreferences
}
