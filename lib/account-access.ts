// 帳號管理使用的職稱選項。資料庫仍保留 role 欄位作為舊資料相容與權限判定，
// 但管理員不需要再直接操作「系統角色」；role 由職稱自動推導。
export const HQ_TITLE_OPTIONS = ['總監', '經理', '助理'] as const
export const STORE_TITLE_OPTIONS = ['店長', '副店長', '小幫手'] as const
export const CK_TITLE_OPTIONS = ['廠長', '副廠長', '小幫手'] as const
export const TITLE_OPTIONS = ['老闆', ...HQ_TITLE_OPTIONS, ...STORE_TITLE_OPTIONS, '廠長', '副廠長'] as const

export function isHQTitle(title?: string | null) {
  const value = (title ?? '').trim()
  return value === '老闆' || value.includes('顧問') || HQ_TITLE_OPTIONS.some(option => value.includes(option))
}

export function inferSystemRole(title?: string | null, fallback?: string | null) {
  const value = (title ?? '').trim()
  if (value.includes('老闆')) return '老闆'
  if (value.includes('總監')) return '總監'
  if (value.includes('經理')) return '經理'
  if (value.includes('顧問')) return '顧問'
  if (value.includes('助理')) return '助理'
  if (value.includes('副廠長')) return '副廠長'
  if (value.includes('廠長')) return '廠長'
  if (value.includes('副店長')) return '副店長'
  if (value.includes('店長')) return '店長'
  if (value.includes('小幫手')) return '小幫手'

  const legacy = (fallback ?? '').trim()
  if (TITLE_OPTIONS.includes(legacy as (typeof TITLE_OPTIONS)[number]) || legacy === '顧問') return legacy
  return '助理'
}

export function isStoreTitle(title?: string | null) {
  const role = inferSystemRole(title)
  return ['店長', '副店長', '小幫手', '廠長', '副廠長'].includes(role)
}
