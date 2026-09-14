export const PUSH_PREFERENCE_OPTIONS = [
  { key: 'review_submission', label: '帳目送出待審核', audience: '總公司' },
  { key: 'review_result', label: '審核通過或退回', audience: '店面／央廚' },
  { key: 'accounting_reminder', label: '未送出與退回逾期提醒', audience: '店面／央廚' },
  { key: 'reimbursement_handoff', label: '央廚補款點交', audience: '央廚' },
  { key: 'hq_escalation', label: '總公司逾期追蹤', audience: '總公司' },
] as const

export type PushPreferenceKey = (typeof PUSH_PREFERENCE_OPTIONS)[number]['key']
export type PushPreferences = Record<PushPreferenceKey, boolean>
export type PushAudienceUnit = 'hq' | 'store' | 'ck'

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

const PUSH_KEYS_BY_UNIT: Record<PushAudienceUnit, PushPreferenceKey[]> = {
  hq: ['review_submission', 'hq_escalation'],
  store: ['review_result', 'accounting_reminder'],
  ck: ['review_result', 'accounting_reminder', 'reimbursement_handoff'],
}

export function pushPreferenceOptionsForUnit(unit: PushAudienceUnit) {
  const allowed = new Set<PushPreferenceKey>(PUSH_KEYS_BY_UNIT[unit])
  return PUSH_PREFERENCE_OPTIONS.filter(option => allowed.has(option.key))
}

export function defaultPushPreferencesForUnit(unit: PushAudienceUnit): PushPreferences {
  const allowed = new Set<PushPreferenceKey>(PUSH_KEYS_BY_UNIT[unit])
  return Object.fromEntries(
    PUSH_PREFERENCE_OPTIONS.map(option => [option.key, allowed.has(option.key)]),
  ) as PushPreferences
}

export function scopePushPreferencesForUnit(value: unknown, unit: PushAudienceUnit): PushPreferences {
  const normalized = normalizePushPreferences(value)
  const allowed = new Set<PushPreferenceKey>(PUSH_KEYS_BY_UNIT[unit])
  return Object.fromEntries(
    PUSH_PREFERENCE_OPTIONS.map(option => [option.key, allowed.has(option.key) && normalized[option.key]]),
  ) as PushPreferences
}
