export const CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS = 24
export const CK_REIMBURSEMENT_AUTO_CONFIRM_MS = CK_REIMBURSEMENT_AUTO_CONFIRM_HOURS * 60 * 60 * 1000

export function getCKReimbursementAutoConfirmAt(sentAt: string | null | undefined) {
  if (!sentAt) return null
  const sentTime = new Date(sentAt).getTime()
  if (!Number.isFinite(sentTime)) return null
  return new Date(sentTime + CK_REIMBURSEMENT_AUTO_CONFIRM_MS).toISOString()
}

export function isCKReimbursementExpired(sentAt: string | null | undefined, now: Date = new Date()) {
  const deadline = getCKReimbursementAutoConfirmAt(sentAt)
  return deadline !== null && new Date(deadline).getTime() <= now.getTime()
}

export function getCKReimbursementRemainingMs(
  sentAt: string | null | undefined,
  now: Date | number = Date.now(),
) {
  const deadline = getCKReimbursementAutoConfirmAt(sentAt)
  if (!deadline) return null
  const nowTime = typeof now === 'number' ? now : now.getTime()
  return Math.max(0, new Date(deadline).getTime() - nowTime)
}

export function formatCKReimbursementCountdown(remainingMs: number | null) {
  if (remainingMs === null) return '期限計算中'
  if (remainingMs <= 0) return '正在自動完成點交…'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `剩餘 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
